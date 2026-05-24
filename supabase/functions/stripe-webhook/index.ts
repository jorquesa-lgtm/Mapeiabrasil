import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = sigHeader.split(",").reduce((acc: Record<string, string>, part) => {
      const [k, v] = part.split("=");
      acc[k] = v;
      return acc;
    }, {});
    const timestamp = parts["t"];
    const signature = parts["v1"];
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const expected = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return expected === signature;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const payload = await req.text();
    const sigHeader = req.headers.get("stripe-signature") ?? "";

    if (STRIPE_WEBHOOK_SECRET) {
      const valid = await verifyStripeSignature(payload, sigHeader, STRIPE_WEBHOOK_SECRET);
      if (!valid) {
        return new Response(JSON.stringify({ error: "invalid_signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const event = JSON.parse(payload);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const customerEmail: string = session.customer_details?.email || session.customer_email || "";
      const customerId: string = session.customer || "";
      const subscriptionId: string | null = session.subscription || null;
      const sessionId: string = session.id || "";
      const plan: string = session.metadata?.plan || (subscriptionId ? "subscription" : "premium");
      const diagId: string | null = session.metadata?.diag_id || null;
      const kitId: string | null = session.metadata?.kit || null;

      // Kit subscriptions: log with stripe_subscription_id so lifecycle events can match
      if (kitId) {
        await supabase.from("subscriptions").upsert(
          {
            email: customerEmail,
            stripe_customer_id: customerId,
            stripe_session_id: sessionId,
            stripe_subscription_id: subscriptionId,  // critical for cancel/update matching
            plan,
            status: "active",
          },
          { onConflict: "stripe_session_id" },
        );
        console.log(`[webhook] kit subscription created: ${plan} for ${customerEmail}`);
        return new Response(JSON.stringify({ ok: true, kit: kitId }), { status: 200 });
      }

      // Upsert subscription record
      await supabase.from("subscriptions").upsert(
        {
          email: customerEmail,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_session_id: sessionId,
          plan,
          status: "active",
          current_period_end: subscriptionId ? null : null,
        },
        { onConflict: "stripe_session_id" },
      );

      // Locate the diagnostic row for this payment. Priority:
      // 1. Match by stripe_session_id (linked by verify-premium or a prior webhook)
      // 2. Match by diag_id from Stripe metadata
      // 3. Match the most recent diagnostic row for this email created in the
      //    last 24h (avoids unlocking stale free reports from months ago)
      let matchedRow: { id: string } | null = null;

      {
        const { data } = await supabase
          .from("diagnostic_responses")
          .select("id")
          .eq("stripe_session_id", sessionId)
          .maybeSingle();
        if (data) matchedRow = data;
      }

      if (!matchedRow && diagId) {
        const { data } = await supabase
          .from("diagnostic_responses")
          .select("id")
          .eq("id", diagId)
          .maybeSingle();
        if (data) matchedRow = data;
      }

      if (!matchedRow && customerEmail) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from("diagnostic_responses")
          .select("id")
          .eq("email", customerEmail.toLowerCase())
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) matchedRow = data;
      }

      if (matchedRow) {
        await supabase
          .from("diagnostic_responses")
          .update({
            plan_tier: plan,
            unlocked: true,
            stripe_session_id: sessionId,
          })
          .eq("id", matchedRow.id);
      }
      // If no row was matched, the user bought premium before taking the quiz.
      // verify-premium (called client-side after the quiz) will link and unlock
      // the row once it exists.

      // Trigger report generation only when the purchase is linked to a real
      // diagnostic row with AI data already generated.
      if (matchedRow) {
        const { data: diagRow } = await supabase
          .from("diagnostic_responses")
          .select("*")
          .eq("id", matchedRow.id)
          .maybeSingle();

        const leadEmail = (diagRow?.email || customerEmail || "").toLowerCase();

        const { data: leadRow } = leadEmail
          ? await supabase
              .from("leads")
              .select("name, company")
              .eq("email", leadEmail)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : { data: null as { name?: string; company?: string } | null };

        // Only trigger the report when we have the AI-generated payload on
        // the row (i.e., the user finished the quiz). Otherwise the quiz
        // completion handler will trigger it itself after verify-premium.
        const hasAiData =
          diagRow?.ai_data &&
          typeof diagRow.ai_data === "object" &&
          Object.keys(diagRow.ai_data).length > 0;

        if (diagRow && hasAiData) {
          EdgeRuntime.waitUntil(
            fetch(`${SUPABASE_URL}/functions/v1/generate-report`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                diag_id: diagRow.id,
                stripe_session_id: sessionId,
                email: leadEmail,
                name: leadRow?.name || leadEmail,
                company: leadRow?.company || diagRow.sector || "",
                sector: diagRow.sector || "",
                global_score: diagRow.global_score,
                maturity_level: diagRow.maturity_level,
                area_scores: diagRow.area_scores,
                ai_data: diagRow.ai_data || {},
              }),
            }).catch((e) => console.error("[stripe-webhook] report trigger failed", e)),
          );
        }
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const status = sub.status;
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;

      await supabase
        .from("subscriptions")
        .update({ status, current_period_end: periodEnd })
        .eq("stripe_subscription_id", sub.id);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook] unexpected", err);
    return new Response(JSON.stringify({ error: "unexpected" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
