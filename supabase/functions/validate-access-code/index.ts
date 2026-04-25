import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Pre-flight check used by the client before starting the premium quiz.
// Does NOT consume the code — consumption happens in verify-premium when
// the diagnostic row is created and unlocked.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "not_configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || "").trim().toUpperCase();
    if (!code) return json({ valid: false, error: "missing_code" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("access_codes")
      .select("code, label, max_uses, used_count, active, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("[validate-access-code] lookup error", error);
      return json({ valid: false, error: "lookup_failed" }, 500);
    }
    if (!data) return json({ valid: false, error: "not_found" }, 200);
    if (!data.active) return json({ valid: false, error: "inactive" }, 200);
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return json({ valid: false, error: "expired" }, 200);
    }
    if (data.used_count >= data.max_uses) {
      return json({ valid: false, error: "exhausted" }, 200);
    }

    return json({
      valid: true,
      code: data.code,
      label: data.label || "",
      remaining: data.max_uses - data.used_count,
    });
  } catch (err) {
    console.error("[validate-access-code] unexpected", err);
    return json({ valid: false, error: "unexpected" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
