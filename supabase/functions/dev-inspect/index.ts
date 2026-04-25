import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Shared secret for the debug console. This is a convenience gate so casual
// visitors can't interact with the page; real security is RLS + verify-premium.
// Rotate by changing this string and redeploying.
const DEV_TOKEN = "mapeia-dev-7k3x9q2b";

type Body = {
  token?: string;
  action?: "lookup" | "seed" | "reset";
  session_id?: string;
  diag_id?: string;
  email?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const body: Body = await req.json().catch(() => ({}));
    if (body.token !== DEV_TOKEN) {
      return json({ error: "forbidden" }, 403);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const action = body.action ?? "lookup";

    if (action === "lookup") {
      let query = supabase
        .from("diagnostic_responses")
        .select("id, email, plan_tier, unlocked, stripe_session_id, global_score, maturity_level, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (body.diag_id) query = query.eq("id", body.diag_id);
      else if (body.session_id) query = query.eq("stripe_session_id", body.session_id);
      else if (body.email) query = query.eq("email", body.email.toLowerCase());

      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, rows: data ?? [] });
    }

    if (action === "seed") {
      const email = (body.email || "dev-test@mapeia.local").toLowerCase();
      const sessionId = body.session_id || `cs_test_seed_${Date.now()}`;
      const { data, error } = await supabase
        .from("diagnostic_responses")
        .insert({
          email,
          sector: "servicos",
          plan_tier: "premium",
          unlocked: false,
          stripe_session_id: sessionId,
          global_score: 42,
          maturity_level: 2,
          area_scores: { dados: 40, processos: 50, pessoas: 35, tecnologia: 45 },
          answers: { sector: "servicos" },
          ai_data: { summary: "Seed row for dev-test" },
        })
        .select("id, stripe_session_id, email")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, inserted: data });
    }

    if (action === "reset") {
      if (!body.diag_id && !body.session_id) {
        return json({ error: "missing_identifier" }, 400);
      }
      const q = supabase
        .from("diagnostic_responses")
        .update({ unlocked: false, plan_tier: "free" });
      const { error } = body.diag_id
        ? await q.eq("id", body.diag_id)
        : await q.eq("stripe_session_id", body.session_id!);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, reset: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("[dev-inspect]", err);
    return json({ error: "unexpected" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
