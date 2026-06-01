import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Validates AND atomically consumes an access code for kit purchases.
// Accepts codes with scope 'kits' or 'all'.
// Call this when the user clicks "Aplicar" on a kit page — if it returns
// { ok: true }, redirect to the kit's obrigado page directly.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, error: "not_configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || "").trim().toUpperCase();
    const kit  = String(body?.kit  || "").trim().toLowerCase(); // e.g. "kit1"
    const email = String(body?.email || "").trim().toLowerCase();

    if (!code) return json({ ok: false, error: "missing_code" }, 400);
    if (!kit)  return json({ ok: false, error: "missing_kit"  }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch and validate the code
    const { data, error: fetchErr } = await supabase
      .from("access_codes")
      .select("code, label, max_uses, used_count, active, expires_at, scope, notes")
      .eq("code", code)
      .maybeSingle();

    if (fetchErr) {
      console.error("[redeem-kit-access-code] lookup error", fetchErr);
      return json({ ok: false, error: "lookup_failed" }, 500);
    }
    if (!data)                return json({ ok: false, error: "not_found"   }, 200);
    if (!data.active)         return json({ ok: false, error: "inactive"    }, 200);
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return json({ ok: false, error: "expired" }, 200);
    }
    if (data.used_count >= data.max_uses) {
      return json({ ok: false, error: "exhausted" }, 200);
    }
    // Scope check: code must cover kits
    const scope = data.scope ?? "diagnostic";
    if (scope !== "kits" && scope !== "all") {
      return json({ ok: false, error: "wrong_scope" }, 200);
    }

    // Atomically consume: guarded by used_count = current value to prevent races
    const newNotes = Array.isArray(data.notes) ? [...data.notes] : [];
    newNotes.push({ kit, email: email || null, used_at: new Date().toISOString() });

    const { error: updateErr } = await supabase
      .from("access_codes")
      .update({
        used_count: data.used_count + 1,
        last_used_at: new Date().toISOString(),
        last_used_email: email || "",
        notes: newNotes,
      })
      .eq("code", code)
      .eq("used_count", data.used_count); // optimistic lock

    if (updateErr) {
      console.error("[redeem-kit-access-code] update error", updateErr);
      // If the update hit 0 rows (race condition), treat as exhausted
      return json({ ok: false, error: "exhausted" }, 200);
    }

    return json({ ok: true, code: data.code, label: data.label || "", kit });
  } catch (err) {
    console.error("[redeem-kit-access-code] unexpected", err);
    return json({ ok: false, error: "unexpected" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
