// src/pages/AdminLeads.tsx
// Internal admin console: all leads + pending WhatsApp handoffs.
// Gated by is_admin() (your email must be in the `admins` table). RLS also
// protects the data server-side, so a non-admin sees nothing even if they reach this URL.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Lead = {
  id: string;
  created_at: string;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  company: string | null;
  sector: string | null;
  source: string | null;
  plan_interest: string | null;
  pain: string | null;
};

type Handoff = {
  id: string;
  created_at: string;
  whatsapp_number: string | null;
  reason: string | null;
  last_user_message: string | null;
  last_assistant_message: string | null;
  status: string | null;
};

const PLAN_LABELS: Record<string, string> = {
  diagnostico_premium: "Diagnóstico Premium",
  evolucao: "Evolução",
  kit_atendente: "Kit Atendente",
  kit_followup: "Kit Follow-up",
  kit_agendamento: "Kit Agendamento",
  kit_cobranca: "Kit Cobrança",
  kit_presenca: "Kit Presença",
  bundle: "Pacote Completo",
  indeciso: "Indeciso",
};

const C = {
  bg: "#040812", nav: "#060c1a", panel: "#0a1322", border: "#1e3a5f",
  text: "#f4f8ff", muted: "#7a9ec8", dim: "#4a6fa0",
  teal: "#00e5c8", blue: "#1a7ff0", amber: "#f5c842", red: "#ff4055",
};

function fmtDate(s: string) {
  try { return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}

export default function AdminLeads() {
  const [phase, setPhase] = useState<"loading" | "anon" | "denied" | "ready">("loading");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [err, setErr] = useState<string>("");

  async function loadData() {
    const [leadsRes, handoffsRes] = await Promise.all([
      supabase.from("leads").select("id,created_at,name,email,whatsapp,company,sector,source,plan_interest,pain").order("created_at", { ascending: false }).limit(150),
      supabase.from("handoff_requests").select("id,created_at,whatsapp_number,reason,last_user_message,last_assistant_message,status").eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    if (leadsRes.error) setErr(leadsRes.error.message);
    setLeads((leadsRes.data as Lead[]) || []);
    setHandoffs((handoffsRes.data as Handoff[]) || []);
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setPhase("anon"); return; }
      setAdminEmail(session.user.email || "");
      const { data: isAdmin } = await supabase.rpc("is_admin");
      if (!isAdmin) { setPhase("denied"); return; }
      await loadData();
      setPhase("ready");
    })();
  }, []);

  async function resolveHandoff(id: string) {
    setResolvingId(id);
    const { error } = await supabase.from("handoff_requests")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: adminEmail })
      .eq("id", id);
    if (!error) setHandoffs(h => h.filter(x => x.id !== id));
    setResolvingId(null);
  }

  if (phase === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <div style={{ width: 40, height: 40, border: `2px solid ${C.border}`, borderTopColor: C.teal, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (phase === "anon" || phase === "denied") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", gap: 12, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{phase === "anon" ? "Faça login" : "Acesso restrito"}</div>
        <div style={{ color: C.muted, fontSize: 14, maxWidth: 360 }}>
          {phase === "anon" ? "Você precisa entrar com sua conta de administrador." : "Esta área é restrita a administradores."}
        </div>
        <a href="/" style={{ marginTop: 8, background: C.blue, color: "#fff", padding: "10px 22px", borderRadius: 980, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>Ir para o login</a>
      </div>
    );
  }

  const now = Date.now();
  const leads7d = leads.filter(l => now - new Date(l.created_at).getTime() < 7 * 864e5).length;
  const stats = [
    { label: "Leads (total)", value: leads.length, color: C.teal },
    { label: "Leads (7 dias)", value: leads7d, color: C.blue },
    { label: "Handoffs pendentes", value: handoffs.length, color: handoffs.length ? C.amber : C.dim },
  ];

  const cell: React.CSSProperties = { padding: "10px 14px", fontSize: 12.5, color: C.muted, borderBottom: `1px solid ${C.border}`, textAlign: "left", whiteSpace: "nowrap" };
  const th: React.CSSProperties = { ...cell, color: C.dim, fontWeight: 700, textTransform: "uppercase", fontSize: 10.5, letterSpacing: ".05em", whiteSpace: "nowrap" };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ padding: "16px 32px", borderBottom: `1px solid ${C.border}`, background: C.nav, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Painel Admin <span style={{ color: C.teal }}>· MapeIA</span></div>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <a href="/admin/ativar" style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>Ativações →</a>
          <span style={{ color: C.dim, fontSize: 12 }}>{adminEmail}</span>
          <button onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/"))}
            style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Sair</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 60px" }}>
        {err && <div style={{ background: "#3a1015", border: `1px solid ${C.red}`, color: "#ffb3bd", padding: "10px 14px", borderRadius: 10, marginBottom: 18, fontSize: 13 }}>Erro ao carregar: {err}</div>}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 28 }}>
          {stats.map(s => (
            <div key={s.label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Handoffs */}
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
          🚨 Handoffs pendentes {handoffs.length > 0 && <span style={{ color: C.amber }}>({handoffs.length})</span>}
        </h2>
        {handoffs.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 13, padding: "14px 0 28px" }}>Nenhum handoff pendente. 🎉</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
            {handoffs.map(h => (
              <div key={h.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{h.whatsapp_number || "—"}</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{h.reason}</div>
                    {h.last_user_message && <div style={{ fontSize: 12, color: C.dim, marginTop: 6, fontStyle: "italic" }}>Cliente: "{h.last_user_message}"</div>}
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>{fmtDate(h.created_at)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    {h.whatsapp_number && (
                      <a href={`https://wa.me/${h.whatsapp_number.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"
                        style={{ background: C.teal, color: "#04221d", padding: "7px 14px", borderRadius: 8, textDecoration: "none", fontSize: 12, fontWeight: 700, textAlign: "center" }}>Responder</a>
                    )}
                    <button onClick={() => resolveHandoff(h.id)} disabled={resolvingId === h.id}
                      style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                      {resolvingId === h.id ? "..." : "Resolver"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Leads */}
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Leads recentes</h2>
        <div style={{ overflowX: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Data</th><th style={th}>Nome</th><th style={th}>Empresa</th>
                <th style={th}>Setor</th><th style={th}>Interesse</th><th style={th}>Origem</th><th style={th}>Contato</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id}>
                  <td style={cell}>{fmtDate(l.created_at)}</td>
                  <td style={{ ...cell, color: C.text }}>{l.name || "—"}</td>
                  <td style={cell}>{l.company || "—"}</td>
                  <td style={cell}>{l.sector || "—"}</td>
                  <td style={cell}>{l.plan_interest ? (PLAN_LABELS[l.plan_interest] || l.plan_interest) : "—"}</td>
                  <td style={cell}>{l.source || "—"}</td>
                  <td style={cell}>{l.whatsapp || l.email || "—"}</td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr><td style={{ ...cell, textAlign: "center", color: C.dim }} colSpan={7}>Nenhum lead ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
