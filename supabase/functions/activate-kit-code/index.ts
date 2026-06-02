import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { code, email } = await req.json();
    if (!code || !email) return new Response(
      JSON.stringify({ error: "Código e email são obrigatórios." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode  = code.trim().toUpperCase();
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: row } = await sb.from("access_codes").select("*")
      .eq("code", cleanCode).eq("active", true).maybeSingle();
    if (!row) return new Response(
      JSON.stringify({ error: "Código não encontrado. Confira a digitação." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
    if (row.expires_at && new Date(row.expires_at) < new Date()) return new Response(
      JSON.stringify({ error: "Este código expirou." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
    if (row.used_count >= row.max_uses) return new Response(
      JSON.stringify({ error: "Este código já atingiu o limite de usos. Fale com a MapeIA para obter um novo." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
    const { data: existing } = await sb.from("subscriptions").select("id")
      .eq("email", cleanEmail).eq("plan", "kit_all").eq("status", "active").maybeSingle();
    if (!existing) {
      await sb.from("subscriptions").insert({
        email: cleanEmail,
        stripe_customer_id: `ff_${cleanCode}`,
        stripe_session_id:  `ff_${cleanCode}`,
        plan: "kit_all",
        status: "active",
      });
      await sb.from("access_codes").update({
        used_count:      (row.used_count ?? 0) + 1,
        last_used_at:    new Date().toISOString(),
        last_used_email: cleanEmail,
      }).eq("code", cleanCode);
    }
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("activate-kit-code:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno." }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
