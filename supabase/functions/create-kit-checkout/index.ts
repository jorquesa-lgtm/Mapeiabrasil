import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price IDs — confirmed live in Stripe (BRL, recurring monthly).
// Env secrets take priority; hardcoded IDs are the fallback.
const KIT_PRICE_DEFAULTS: Record<string, string> = {
  kit1:   "price_1TafZv3ZopExAYorc9oKjs8c",   // R$250/mo — Atendente 24h
  kit2:   "price_1TafaA3ZopExAYoruX85gX5Z",   // R$199/mo — Follow-up de Leads
  kit3:   "price_1TafaN3ZopExAYorlTdfy4aJ",   // R$199/mo — Agendamento Anti-No-Show
  kit4:   "price_1Tafaa3ZopExAYornmIJhp1C",   // R$199/mo — Cobrança Amigável
  kit5:   "price_1Tafao3ZopExAYorfYjqKLVu",   // R$199/mo — Presença Social
  bundle: "price_1Tafb43ZopExAYoriJ0BaK0U",   // R$699/mo — Pacote Completo
};
const KIT_PRICE_SECRETS: Record<string, string> = {
  kit1: "STRIPE_KIT1_PRICE", kit2: "STRIPE_KIT2_PRICE",
  kit3: "STRIPE_KIT3_PRICE", kit4: "STRIPE_KIT4_PRICE",
  kit5: "STRIPE_KIT5_PRICE", bundle: "STRIPE_BUNDLE_PRICE",
};

const KIT_LABELS: Record<string, string> = {
  kit1:   "Kit Atendente 24h",
  kit2:   "Kit Follow-up de Leads",
  kit3:   "Kit Agendamento Anti-No-Show",
  kit4:   "Kit Cobrança Amigável",
  kit5:   "Kit Presença Social",
  bundle: "Pacote Completo — 5 Kits",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const kit: string = (body.kit || "").toLowerCase().trim();
    const email: string = (body.email || "").trim();
    const successUrl: string = body.success_url || `https://mapeiabrasil.com/kits/obrigado.html?kit=${kit}`;
    const cancelUrl: string = body.cancel_url || `https://mapeiabrasil.com/kits/`;

    if (!KIT_PRICE_SECRETS[kit]) {
      return json({ ok: false, error: "invalid_kit", valid: Object.keys(KIT_PRICE_SECRETS) }, 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ ok: false, error: "stripe_not_configured" }, 500);

    const priceId = Deno.env.get(KIT_PRICE_SECRETS[kit]) || KIT_PRICE_DEFAULTS[kit];
    if (!priceId) {
      return json({ ok: false, error: "kit_price_not_configured" }, 500);
    }

    const sep = successUrl.includes("?") ? "&" : "?";
    const sessionPayload: Record<string, unknown> = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}${sep}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      // subscription_data carries metadata for recurring payments
      subscription_data: {
        metadata: { kit, kit_label: KIT_LABELS[kit], plan: `kit_${kit}` },
      },
      metadata: { kit, kit_label: KIT_LABELS[kit], plan: `kit_${kit}` },
    };

    if (email) {
      sessionPayload.customer_email = email;
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(
        Object.entries(sessionPayload).flatMap(([k, v]) => {
          if (k === "line_items") {
            const items = v as Array<Record<string, unknown>>;
            return items.flatMap((item, i) =>
              Object.entries(item).map(([ik, iv]) => [`line_items[${i}][${ik}]`, String(iv)])
            );
          }
          if (k === "metadata") {
            return Object.entries(v as Record<string, string>).map(([mk, mv]) => [`metadata[${mk}]`, mv]);
          }
          return [[k, String(v)]];
        })
      ).toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error("Stripe error:", session);
      return json({ ok: false, error: "stripe_error", detail: session?.error?.message }, 500);
    }

    return json({ ok: true, url: session.url, session_id: session.id });
  } catch (err) {
    console.error("create-kit-checkout error:", err);
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
