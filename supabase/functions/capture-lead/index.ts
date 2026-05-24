import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LeadPayload {
  name?: string;
  email?: string;
  whatsapp?: string;
  company?: string;
  sector?: string;
  source?: string;
  plan_interest?: string;
}

const FROM_EMAIL = Deno.env.get("LEAD_FROM_EMAIL") ?? "MapeIA Brasil <no-reply@mapeia.com.br>";
const NOTIFY_EMAIL = Deno.env.get("LEAD_NOTIFY_EMAIL") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

function sanitize(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, max);
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function planLabel(plan: string): string {
  if (plan === "diagnostic") return "Diagnostico Completo";
  if (plan === "premium") return "Diagnostico Completo";
  if (plan === "subscription") return "Assinatura Evolucao";
  if (plan === "advisory") return "Advisory Personalizado";
  return "Diagnostico MapeAI";
}

function buildWelcomeHtml(name: string, plan: string): string {
  const label = planLabel(plan);
  const firstName = name.split(" ")[0] || name;
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#0b1420;color:#e6eef8;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#0f1b2c;border:1px solid #1e2d45;border-radius:14px;padding:32px;">
    <div style="font-size:12px;letter-spacing:.12em;color:#35c4a8;text-transform:uppercase;font-weight:700;margin-bottom:10px;">MapeIA Brasil</div>
    <h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.25;color:#ffffff;margin:0 0 12px;">Oi, ${firstName}! Bom te ver por aqui.</h1>
    <p style="font-size:15px;line-height:1.6;color:#b9c7d8;margin:0 0 16px;">
      Voce esta respondendo o <strong style="color:#ffffff;">${label}</strong> da MapeAI Brasil.
      Complete as 33 perguntas — ao final, voce podera desbloquear seu relatorio completo com score de maturidade,
      3 quick wins priorizados e um roadmap 30/60/90 dias construido para o seu negocio.
    </p>
    <p style="font-size:15px;line-height:1.6;color:#b9c7d8;margin:0 0 24px;">
      Se precisar de ajuda durante o diagnostico, responda este e-mail ou fale com a gente pelo WhatsApp.
    </p>
    <a href="https://wa.me/5512996790859" style="display:inline-block;background:linear-gradient(135deg,#35c4a8,#2aa88f);color:#0a0f1a;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:14px;">Falar no WhatsApp</a>
    <p style="font-size:12px;color:#6b7a8c;margin-top:28px;line-height:1.5;">
      Voce recebeu este e-mail porque solicitou o diagnostico em mapeaibrasil.com.<br>
      Seus dados estao protegidos segundo a LGPD.
    </p>
  </div>
</body></html>`;
}

function buildAdminHtml(lead: Required<LeadPayload>): string {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;">
  <h2>Novo lead capturado</h2>
  <table style="border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Nome</td><td>${lead.name}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">E-mail</td><td>${lead.email}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">WhatsApp</td><td>${lead.whatsapp || "-"}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Empresa</td><td>${lead.company || "-"}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Origem</td><td>${lead.source}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Plano</td><td>${planLabel(lead.plan_interest)}</td></tr>
  </table>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.log(`[capture-lead] RESEND_API_KEY not set; skipping send to ${to} (${subject})`);
    return { ok: false, error: "email_provider_not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[capture-lead] resend error", res.status, body);
      return { ok: false, error: `resend_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[capture-lead] resend exception", err);
    return { ok: false, error: "resend_exception" };
  }
}

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
    const raw = (await req.json()) as LeadPayload;

    const lead = {
      name: sanitize(raw.name, 200),
      email: sanitize(raw.email, 319).toLowerCase(),
      whatsapp: sanitize(raw.whatsapp, 39),
      company: sanitize(raw.company, 200),
      sector: sanitize(raw.sector, 80),
      source: sanitize(raw.source, 80) || "unknown",
      plan_interest: sanitize(raw.plan_interest, 40) || "free",
    };

    // Name is optional — fall back to the email username so downstream
    // emails and reports always have something to greet the user with.
    if (!lead.name) {
      lead.name = lead.email ? lead.email.split("@")[0] : "";
    }
    if (!lead.email || !isEmail(lead.email)) {
      return new Response(JSON.stringify({ error: "email_invalid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: inserted, error: insertError } = await supabase
      .from("leads")
      .insert(lead)
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("[capture-lead] insert error", insertError);
      return new Response(JSON.stringify({ error: "persist_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const welcome = await sendEmail(
      lead.email,
      "Seu diagnostico MapeIA esta a caminho",
      buildWelcomeHtml(lead.name, lead.plan_interest),
    );

    let adminNotified: { ok: boolean; error?: string } | null = null;
    if (NOTIFY_EMAIL) {
      adminNotified = await sendEmail(
        NOTIFY_EMAIL,
        `Novo lead: ${lead.name} (${planLabel(lead.plan_interest)})`,
        buildAdminHtml(lead as Required<LeadPayload>),
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lead_id: inserted?.id ?? null,
        email_sent: welcome.ok,
        email_error: welcome.ok ? null : welcome.error,
        admin_notified: adminNotified ? adminNotified.ok : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[capture-lead] unexpected", err);
    return new Response(JSON.stringify({ error: "unexpected" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
