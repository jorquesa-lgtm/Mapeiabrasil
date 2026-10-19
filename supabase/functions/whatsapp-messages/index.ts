import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Returns the MapeIA WhatsApp bot's recent Twilio messages, for the admin
// portal's "WhatsApp" tab. Admin-only: the caller's JWT must pass is_admin().
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin } = await sb.rpc("is_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Trim guards against trailing spaces/newlines pasted into the secret.
    const sidRaw = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
    const tokenRaw = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
    const sid = sidRaw.trim();
    const token = tokenRaw.trim();
    if (!sid || !token) {
      return new Response(JSON.stringify({ error: "twilio_not_configured" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    // Non-sensitive diagnostics (lengths/prefix only) to debug a bad secret.
    const diag = {
      sid_len: sid.length, sid_prefix: sid.slice(0, 2),
      sid_had_space: sidRaw !== sid,
      token_len: token.length, token_had_space: tokenRaw !== token,
    };
    const pageSize = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? "300"), 1000);
    const twUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?PageSize=${pageSize}`;
    const twRes = await fetch(twUrl, {
      headers: { Authorization: "Basic " + btoa(`${sid}:${token}`) },
    });
    const data = await twRes.json();
    if (!twRes.ok) {
      return new Response(JSON.stringify({ error: "twilio_error", detail: data, diag }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const messages = (data.messages ?? []).map((m: Record<string, string>) => ({
      sid: m.sid,
      direction: m.direction,
      from: (m.from ?? "").replace("whatsapp:", ""),
      to: (m.to ?? "").replace("whatsapp:", ""),
      body: m.body ?? "",
      status: m.status,
      date: m.date_sent || m.date_created,
    }));

    return new Response(JSON.stringify({ messages }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "internal", detail: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
