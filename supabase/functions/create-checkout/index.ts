import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Price IDs: read from env first, fallback to live IDs for backwards compat.
// Set STRIPE_PRICE_PREMIUM and STRIPE_PRICE_SUBSCRIPTION to override (e.g. in test mode).
const PRICE_IDS: Record<string, string> = {
  premium: Deno.env.get("STRIPE_PRICE_PREMIUM") || "price_1TOMNR3ZopExAYorc5jC5rgK",
  subscription: Deno.env.get("STRIPE_PRICE_SUBSCRIPTION") || "price_1TOMNy3ZopExAYor1z7ygWa3",
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
    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: "stripe_not_configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const plan: string = body.plan || "premium";
    const successUrl: string = body.success_url || "https://mapeia.com.br/obrigado";
    const cancelUrl: string = body.cancel_url || "https://mapeia.com.br/diagnostico";
    const email: string | undefined = body.email;
    const diagId: string | undefined = body.diag_id;
    const score: number | undefined = body.score;
    // Allow callers to merge extra metadata (e.g. ativar_activation_id)
    const extraMeta: Record<string, string> = body.metadata && typeof body.metadata === "object"
      ? Object.fromEntries(Object.entries(body.metadata as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
      : {};

    const priceId = PRICE_IDS[plan] ?? PRICE_IDS.premium;

    // Enforce 1-diagnostic limit for one-time premium: block checkout if
    // this email already has an unlocked premium diagnostic.
    if (plan === "premium" && email) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
      const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (SUPABASE_URL && SERVICE_ROLE) {
        const { createClient } = await import("npm:@supabase/supabase-js@2");
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: existing } = await supabase
          .from("diagnostic_responses")
          .select("id")
          .eq("email", email.toLowerCase())
          .eq("plan_tier", "premium")
          .eq("unlocked", true)
          .limit(1)
          .maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({
              error: "already_used",
              message: "Este e-mail já possui um diagnóstico Premium ativo. Para realizar diagnósticos adicionais, assine o plano Evolução.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    const sep = successUrl.includes("?") ? "&" : "?";
    const params: Record<string, unknown> = {
      mode: plan === "subscription" ? "subscription" : "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}${sep}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    };

    if (email) params.customer_email = email;

    const metaBase = {
      ...(diagId ? { diag_id: diagId } : {}),
      ...(score !== undefined ? { score: String(score) } : {}),
      plan,
      ...extraMeta,
    };
    if (Object.keys(metaBase).length > 0) {
      params.metadata = metaBase;
    }

    const formBody = Object.entries(flattenParams(params))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });

    if (!stripeRes.ok) {
      const errText = await stripeRes.text();
      console.error("[create-checkout] stripe error", stripeRes.status, errText);
      return new Response(
        JSON.stringify({ error: "stripe_error", detail: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const session = await stripeRes.json();

    return new Response(
      JSON.stringify({ ok: true, url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[create-checkout] unexpected", err);
    return new Response(
      JSON.stringify({ error: "unexpected" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// Flatten nested objects to Stripe's bracket notation
function flattenParams(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          Object.assign(result, flattenParams(item as Record<string, unknown>, `${fullKey}[${i}]`));
        } else {
          result[`${fullKey}[${i}]`] = String(item);
        }
      });
    } else if (typeof value === "object" && value !== null) {
      Object.assign(result, flattenParams(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}
