import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type VerifyBody = {
  session_id?: string;
  diag_id?: string;
  access_code?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "not_configured" }, 500);
    }

    const body: VerifyBody = await req.json().catch(() => ({}));
    const sessionId = (body.session_id || "").trim();
    const diagId = (body.diag_id || "").trim() || null;
    const accessCode = (body.access_code || "").trim().toUpperCase();

    if (!sessionId && !accessCode) {
      return json({ ok: false, error: "missing_credentials" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let email: string | null = null;
    let unlockedVia: "stripe" | "access_code" = "stripe";
    let validatedSessionId: string | null = null;
    let validatedAccessCode: string | null = null;

    if (accessCode) {
      const { data: code, error: codeErr } = await supabase
        .from("access_codes")
        .select("code, max_uses, used_count, active, expires_at, label")
        .eq("code", accessCode)
        .maybeSingle();

      if (codeErr) {
        console.error("[verify-premium] access_code lookup error", codeErr);
        return json({ ok: false, error: "code_lookup_failed" }, 500);
      }
      if (!code) return json({ ok: false, paid: false, error: "code_not_found" }, 200);
      if (!code.active) return json({ ok: false, paid: false, error: "code_inactive" }, 200);
      if (code.expires_at && new Date(code.expires_at) < new Date()) {
        return json({ ok: false, paid: false, error: "code_expired" }, 200);
      }
      if (code.used_count >= code.max_uses) {
        return json({ ok: false, paid: false, error: "code_exhausted" }, 200);
      }
      validatedAccessCode = code.code;
      unlockedVia = "access_code";
    } else {
      if (!STRIPE_SECRET_KEY) return json({ error: "not_configured" }, 500);

      const stripeRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
      );

      if (!stripeRes.ok) {
        const errText = await stripeRes.text();
        console.error("[verify-premium] stripe error", stripeRes.status, errText);
        return json({ ok: false, error: "stripe_lookup_failed" }, 502);
      }

      const session = await stripeRes.json();
      const paid =
        session.payment_status === "paid" ||
        session.status === "complete" ||
        (session.mode === "subscription" && session.status === "active");

      if (!paid) {
        return json({ ok: false, paid: false, status: session.status, payment_status: session.payment_status }, 200);
      }

      email =
        session.customer_details?.email ||
        session.customer_email ||
        null;
      validatedSessionId = sessionId;
    }

    // Link and unlock the diagnostic row. Priority:
    // 1. Row already matching this credential
    // 2. Row with given diag_id
    // 3. Most recent diagnostic row for this email (Stripe path only)
    let targetRow: { id: string; email: string | null } | null = null;

    if (validatedSessionId) {
      const { data } = await supabase
        .from("diagnostic_responses")
        .select("id, email")
        .eq("stripe_session_id", validatedSessionId)
        .maybeSingle();
      if (data) targetRow = data;
    } else if (validatedAccessCode) {
      const { data } = await supabase
        .from("diagnostic_responses")
        .select("id, email")
        .eq("access_code", validatedAccessCode)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) targetRow = data;
    }

    if (!targetRow && diagId) {
      const { data } = await supabase
        .from("diagnostic_responses")
        .select("id, email")
        .eq("id", diagId)
        .maybeSingle();
      if (data) targetRow = data;
    }

    if (!targetRow && email) {
      const { data } = await supabase
        .from("diagnostic_responses")
        .select("id, email")
        .eq("email", email.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) targetRow = data;
    }

    if (targetRow) {
      const updatePayload: Record<string, unknown> = {
        unlocked: true,
        plan_tier: "premium",
      };
      if (validatedSessionId) updatePayload.stripe_session_id = validatedSessionId;
      if (validatedAccessCode) updatePayload.access_code = validatedAccessCode;

      await supabase
        .from("diagnostic_responses")
        .update(updatePayload)
        .eq("id", targetRow.id);

      if (validatedAccessCode) {
        // Atomic-ish consume: re-check + increment guarded by used_count.
        // If two requests race, the second will fail the WHERE clause.
        const { data: codeRow } = await supabase
          .from("access_codes")
          .select("used_count, max_uses, notes")
          .eq("code", validatedAccessCode)
          .maybeSingle();

        if (codeRow && codeRow.used_count < codeRow.max_uses) {
          const newNotes = Array.isArray(codeRow.notes) ? [...codeRow.notes] : [];
          newNotes.push({
            diag_id: targetRow.id,
            email: (targetRow.email || "").toLowerCase() || null,
            used_at: new Date().toISOString(),
          });
          await supabase
            .from("access_codes")
            .update({
              used_count: codeRow.used_count + 1,
              last_used_at: new Date().toISOString(),
              last_used_email: (targetRow.email || "").toLowerCase() || "",
              notes: newNotes,
            })
            .eq("code", validatedAccessCode)
            .eq("used_count", codeRow.used_count);
        }
      }

      // Fire-and-forget report generation. Only trigger when the row has
      // the AI payload (i.e., the quiz was completed) to avoid generating
      // an empty report. If the row has no ai_data yet, the client can
      // re-call verify-premium after the quiz is finished.
      const { data: fullRow } = await supabase
        .from("diagnostic_responses")
        .select("*")
        .eq("id", targetRow.id)
        .maybeSingle();

      const hasAiData =
        fullRow?.ai_data &&
        typeof fullRow.ai_data === "object" &&
        Object.keys(fullRow.ai_data).length > 0;

      if (fullRow && hasAiData) {
        const leadEmail = (fullRow.email || email || "").toLowerCase();
        const { data: leadRow } = leadEmail
          ? await supabase
              .from("leads")
              .select("name, company")
              .eq("email", leadEmail)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : { data: null as { name?: string; company?: string } | null };

        const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        EdgeRuntime.waitUntil(
          fetch(`${SUPABASE_URL}/functions/v1/generate-report`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${ANON}`,
            },
            body: JSON.stringify({
              diag_id: fullRow.id,
              stripe_session_id: validatedSessionId,
              access_code: validatedAccessCode,
              email: leadEmail,
              name: leadRow?.name || leadEmail,
              company: leadRow?.company || fullRow.sector || "",
              sector: fullRow.sector || "",
              global_score: fullRow.global_score,
              maturity_level: fullRow.maturity_level,
              area_scores: fullRow.area_scores,
              ai_data: fullRow.ai_data || {},
            }),
          }).catch((e) => console.error("[verify-premium] report trigger failed", e)),
        );
      }
    }

    return json({
      ok: true,
      paid: true,
      via: unlockedVia,
      diag_id: targetRow?.id ?? null,
      linked: !!targetRow,
      email,
    }, 200);
  } catch (err) {
    console.error("[verify-premium] unexpected", err);
    return json({ ok: false, error: "unexpected" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
