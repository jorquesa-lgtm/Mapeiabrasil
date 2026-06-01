import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { RefreshCw, Download, Search } from "lucide-react";

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

const KIT_PLAN_IDS = new Set([
  "kit_atendente",
  "kit_followup",
  "kit_agendamento",
  "kit_cobranca",
  "kit_presenca",
  "bundle",
]);

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function exportCSV(leads: Lead[]) {
  const header = "Data,Nome,Empresa,Setor,Interesse,Origem,Contato";
  const rows = leads.map((l) => {
    const contact = l.whatsapp || l.email || "";
    return [
      fmtDate(l.created_at),
      l.name || "",
      l.company || "",
      l.sector || "",
      l.plan_interest
        ? PLAN_LABELS[l.plan_interest] || l.plan_interest
        : "",
      l.source || "",
      contact,
    ]
      .map((v) => `"${v.replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type PlanFilter = "all" | "free" | "premium" | "kits";

export default function AdminLeads() {
  const [phase, setPhase] = useState<
    "loading" | "anon" | "denied" | "ready"
  >("loading");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    const [leadsRes, handoffsRes] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id,created_at,name,email,whatsapp,company,sector,source,plan_interest,pain"
        )
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("handoff_requests")
        .select(
          "id,created_at,whatsapp_number,reason,last_user_message,last_assistant_message,status"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    if (leadsRes.error) setErr(leadsRes.error.message);
    setLeads((leadsRes.data as Lead[]) || []);
    setHandoffs((handoffsRes.data as Handoff[]) || []);
  }

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setPhase("anon");
        return;
      }
      setAdminEmail(session.user.email || "");
      const { data: isAdmin } = await supabase.rpc("is_admin");
      if (!isAdmin) {
        setPhase("denied");
        return;
      }
      await loadData();
      setPhase("ready");
    })();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function resolveHandoff(id: string) {
    setResolvingId(id);
    const { error } = await supabase
      .from("handoff_requests")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: adminEmail,
      })
      .eq("id", id);
    if (!error) setHandoffs((h) => h.filter((x) => x.id !== id));
    setResolvingId(null);
  }

  // -- Filtering --
  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (l.name || "").toLowerCase().includes(q) ||
      (l.email || "").toLowerCase().includes(q) ||
      (l.company || "").toLowerCase().includes(q) ||
      (l.whatsapp || "").toLowerCase().includes(q) ||
      (l.sector || "").toLowerCase().includes(q);

    let matchesPlan = true;
    if (planFilter === "free") {
      matchesPlan =
        !l.plan_interest ||
        l.plan_interest === "indeciso" ||
        l.plan_interest === "evolucao";
    } else if (planFilter === "premium") {
      matchesPlan = l.plan_interest === "diagnostico_premium";
    } else if (planFilter === "kits") {
      matchesPlan = !!l.plan_interest && KIT_PLAN_IDS.has(l.plan_interest);
    }

    return matchesSearch && matchesPlan;
  });

  // -- Loading state --
  if (phase === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f7",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            border: "3px solid #e8e8ed",
            borderTopColor: "#0071e3",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // -- Auth walls --
  if (phase === "anon" || phase === "denied") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f7",
          fontFamily: FONT,
          gap: 10,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700, color: "#1d1d1f" }}>
          {phase === "anon" ? "Faca login" : "Acesso restrito"}
        </div>
        <div style={{ color: "#6e6e73", fontSize: 15, maxWidth: 360 }}>
          {phase === "anon"
            ? "Voce precisa entrar com sua conta de administrador."
            : "Esta area e restrita a administradores."}
        </div>
        <a
          href="/"
          style={{
            marginTop: 12,
            background: "#0071e3",
            color: "#fff",
            padding: "10px 24px",
            borderRadius: 980,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Ir para o login
        </a>
      </div>
    );
  }

  // -- Stats --
  const now = Date.now();
  const leads7d = leads.filter(
    (l) => now - new Date(l.created_at).getTime() < 7 * 864e5
  ).length;

  const stats = [
    { label: "LEADS TOTAL", value: leads.length, dot: "#34c759" },
    { label: "LEADS 7 DIAS", value: leads7d, dot: "#0071e3" },
    {
      label: "HANDOFFS PENDENTES",
      value: handoffs.length,
      dot: handoffs.length ? "#ff9500" : "#d2d2d7",
    },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f7",
        fontFamily: FONT,
        color: "#1d1d1f",
      }}
    >
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .al-row:hover{background:#f5f5f7}
        .al-btn-secondary:hover{background:#f5f5f7!important}
        .al-btn-primary:hover{background:#0077ed!important}
        .al-input:focus{outline:none;border-color:#0071e3;box-shadow:0 0 0 3px rgba(0,113,227,0.15)}
        .al-link:hover{color:#0071e3!important}
      `}</style>

      {/* Nav */}
      <nav
        style={{
          padding: "14px 32px",
          borderBottom: "1px solid #e8e8ed",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: "#1d1d1f", letterSpacing: "-0.01em" }}>
            MapeIA
          </span>
          <span style={{ color: "#86868b", fontSize: 17, fontWeight: 400 }}>
            Admin
          </span>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <a
            href="/admin/ativar"
            className="al-link"
            style={{
              color: "#6e6e73",
              fontSize: 13,
              textDecoration: "none",
              fontWeight: 500,
              transition: "color .15s",
            }}
          >
            Ativacoes
          </a>
          <span style={{ color: "#86868b", fontSize: 12 }}>{adminEmail}</span>
          <button
            className="al-btn-secondary"
            onClick={() =>
              supabase.auth.signOut().then(() => (window.location.href = "/"))
            }
            style={{
              background: "#fff",
              border: "1px solid #d2d2d7",
              color: "#1d1d1f",
              padding: "6px 16px",
              borderRadius: 980,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: FONT,
              transition: "background .15s",
            }}
          >
            Sair
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px 64px" }}>
        {err && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #ff3b30",
              color: "#ff3b30",
              padding: "12px 16px",
              borderRadius: 12,
              marginBottom: 20,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Erro ao carregar: {err}
          </div>
        )}

        {/* Stat cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 32,
          }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                background: "#fff",
                border: "1px solid #e8e8ed",
                borderRadius: 18,
                padding: "22px 24px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: 34, fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.02em" }}>
                {s.value}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: s.dot,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#86868b",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Handoffs */}
        {handoffs.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 17,
                fontWeight: 600,
                margin: "0 0 14px",
                color: "#1d1d1f",
              }}
            >
              Handoffs pendentes
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#ff9500",
                }}
              >
                ({handoffs.length})
              </span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {handoffs.map((h) => (
                <div
                  key={h.id}
                  style={{
                    background: "#fff",
                    border: "1px solid #e8e8ed",
                    borderLeft: "3px solid #ff9500",
                    borderRadius: 14,
                    padding: "16px 20px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 16,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          color: "#1d1d1f",
                          fontWeight: 600,
                        }}
                      >
                        {h.whatsapp_number || "\u2014"}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#6e6e73",
                          marginTop: 4,
                        }}
                      >
                        {h.reason}
                      </div>
                      {h.last_user_message && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#86868b",
                            marginTop: 6,
                            fontStyle: "italic",
                          }}
                        >
                          Cliente: &ldquo;{h.last_user_message}&rdquo;
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          color: "#86868b",
                          marginTop: 6,
                        }}
                      >
                        {fmtDate(h.created_at)}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        flexShrink: 0,
                      }}
                    >
                      {h.whatsapp_number && (
                        <a
                          href={`https://wa.me/${h.whatsapp_number.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: "#34c759",
                            color: "#fff",
                            padding: "7px 16px",
                            borderRadius: 980,
                            textDecoration: "none",
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: "center",
                          }}
                        >
                          Responder
                        </a>
                      )}
                      <button
                        className="al-btn-secondary"
                        onClick={() => resolveHandoff(h.id)}
                        disabled={resolvingId === h.id}
                        style={{
                          background: "#fff",
                          border: "1px solid #d2d2d7",
                          color: "#1d1d1f",
                          padding: "7px 16px",
                          borderRadius: 980,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 500,
                          fontFamily: FONT,
                          transition: "background .15s",
                        }}
                      >
                        {resolvingId === h.id ? "..." : "Resolver"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leads section header + toolbar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: "#1d1d1f" }}>
            Leads recentes
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#86868b",
                  pointerEvents: "none",
                }}
              />
              <input
                className="al-input"
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: "#fff",
                  border: "1px solid #d2d2d7",
                  borderRadius: 10,
                  padding: "8px 12px 8px 32px",
                  fontSize: 13,
                  color: "#1d1d1f",
                  fontFamily: FONT,
                  width: 200,
                  transition: "border-color .15s, box-shadow .15s",
                }}
              />
            </div>

            {/* Plan filter */}
            <select
              className="al-input"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
              style={{
                background: "#fff",
                border: "1px solid #d2d2d7",
                borderRadius: 10,
                padding: "8px 14px",
                fontSize: 13,
                color: "#1d1d1f",
                fontFamily: FONT,
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%2386868b\'/%3E%3C/svg%3E")',
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                paddingRight: 32,
                transition: "border-color .15s, box-shadow .15s",
              }}
            >
              <option value="all">Todos os planos</option>
              <option value="free">Free</option>
              <option value="premium">Premium</option>
              <option value="kits">Kits</option>
            </select>

            {/* Atualizar */}
            <button
              className="al-btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#fff",
                border: "1px solid #d2d2d7",
                color: "#1d1d1f",
                padding: "8px 16px",
                borderRadius: 980,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: FONT,
                transition: "background .15s",
              }}
            >
              <RefreshCw
                size={14}
                style={{
                  animation: refreshing ? "spin 1s linear infinite" : "none",
                }}
              />
              Atualizar
            </button>

            {/* Exportar CSV */}
            <button
              className="al-btn-primary"
              onClick={() => exportCSV(filtered)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#0071e3",
                border: "none",
                color: "#fff",
                padding: "8px 18px",
                borderRadius: 980,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: FONT,
                transition: "background .15s",
              }}
            >
              <Download size={14} />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Leads table */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e8ed",
            borderRadius: 18,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Data", "Nome", "Empresa", "Setor", "Interesse", "Origem", "Contato"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "14px 16px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#86868b",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        textAlign: "left",
                        borderBottom: "1px solid #e8e8ed",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="al-row" style={{ transition: "background .1s" }}>
                  <td
                    style={{
                      padding: "13px 16px",
                      fontSize: 13,
                      color: "#6e6e73",
                      borderBottom: "1px solid #e8e8ed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtDate(l.created_at)}
                  </td>
                  <td
                    style={{
                      padding: "13px 16px",
                      fontSize: 13,
                      color: "#1d1d1f",
                      fontWeight: 500,
                      borderBottom: "1px solid #e8e8ed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.name || "\u2014"}
                  </td>
                  <td
                    style={{
                      padding: "13px 16px",
                      fontSize: 13,
                      color: "#6e6e73",
                      borderBottom: "1px solid #e8e8ed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.company || "\u2014"}
                  </td>
                  <td
                    style={{
                      padding: "13px 16px",
                      fontSize: 13,
                      color: "#6e6e73",
                      borderBottom: "1px solid #e8e8ed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.sector || "\u2014"}
                  </td>
                  <td
                    style={{
                      padding: "13px 16px",
                      fontSize: 13,
                      color: "#6e6e73",
                      borderBottom: "1px solid #e8e8ed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.plan_interest
                      ? PLAN_LABELS[l.plan_interest] || l.plan_interest
                      : "\u2014"}
                  </td>
                  <td
                    style={{
                      padding: "13px 16px",
                      fontSize: 13,
                      color: "#6e6e73",
                      borderBottom: "1px solid #e8e8ed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.source || "\u2014"}
                  </td>
                  <td
                    style={{
                      padding: "13px 16px",
                      fontSize: 13,
                      color: "#6e6e73",
                      borderBottom: "1px solid #e8e8ed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.whatsapp || l.email || "\u2014"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "40px 16px",
                      textAlign: "center",
                      fontSize: 14,
                      color: "#86868b",
                    }}
                  >
                    Nenhum lead encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        <div style={{ marginTop: 14, fontSize: 12, color: "#86868b", textAlign: "right" }}>
          {filtered.length} de {leads.length} leads
        </div>
      </div>
    </div>
  );
}
