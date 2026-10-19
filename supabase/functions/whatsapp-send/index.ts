import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Sends a WhatsApp reply through Twilio, as the MapeIA bot number, from the
// admin portal. Admin-only (is_admin). Reuses the Twilio secrets.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// The bot's WhatsApp sender. Override with TWILIO_WHATSAPP_FROM if it changes.
const DEFAULT_FROM = "whatsapp:+5511922031943";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: isAdmin } = await sb.rpc("is_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { to, body } = await req.json().catch(() => ({}));
    if (!to || !body || !String(body).trim()) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const sid = (Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim();
    const token = (Deno.env.get("TWILIO_AUTH_TOKEN") ?? "").trim();
    if (!sid || !token) {
      return new Response(JSON.stringify({ error: "twilio_not_configured" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const from = (Deno.env.get("TWILIO_WHATSAPP_FROM") ?? DEFAULT_FROM).trim();
    const toAddr = String(to).startsWith("whatsapp:") ? String(to) : `whatsapp:${to}`;

    const form = new URLSearchParams({ From: from, To: toAddr, Body: String(body) });
    const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const data = await twRes.json();
    if (!twRes.ok) {
      return new Response(JSON.stringify({ error: "twilio_error", detail: data }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, sid: data.sid, status: data.status }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "internal", detail: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
