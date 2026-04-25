// TODO: add auth gate
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Activation = {
  id: string;
  created_at: string;
  client_name: string;
  client_email: string;
  tool_name: string;
  gap_area: string;
  status: string;
  price_monthly: number;
};

type WaitlistEntry = {
  tool_id: string;
  tool_name: string;
  count: number;
};

type Tab = "ativacoes" | "espera";

const STATUS_COLOR: Record<string, string> = {
  pending: "#f5c842",
  active: "#00c896",
  cancelled: "#ff4055",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  active: "Ativo",
  cancelled: "Cancelado",
};

export default function AdminAtivar() {
  const [tab, setTab] = useState<Tab>("ativacoes");
  const [activations, setActivations] = useState<Activation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [actRes, waitRes] = await Promise.all([
        supabase
          .from("ativar_activations")
          .select("id,created_at,client_name,client_email,tool_name,gap_area,status,price_monthly")
          .order("created_at", { ascending: false }),
        supabase
          .from("ativar_waitlist")
          .select("tool_id,tool_name"),
      ]);

      setActivations((actRes.data as Activation[]) || []);

      // Group waitlist by tool_id
      const grouped: Record<string, WaitlistEntry> = {};
      ((waitRes.data as { tool_id: string; tool_name: string }[]) || []).forEach((row) => {
        if (!grouped[row.tool_id]) {
          grouped[row.tool_id] = { tool_id: row.tool_id, tool_name: row.tool_name, count: 0 };
        }
        grouped[row.tool_id].count++;
      });
      setWaitlist(Object.values(grouped).sort((a, b) => b.count - a.count));

      setLoading(false);
    }
    load();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#040812", fontFamily: "'DM Sans', sans-serif", color: "#c8daf0" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>

      {/* Topnav */}
      <nav style={{ padding: "16px 32px", borderBottom: "1px solid #1e3a5f", background: "#060c1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#f4f8ff" }}>
          MapeIA <span style={{ color: "#00e5c8" }}>Brasil</span>
          <span style={{ marginLeft: 12, fontSize: 13, color: "#4a6fa0", fontFamily: "DM Sans, sans-serif" }}>/ Admin Ativar</span>
        </div>
        <a href="/" style={{ fontSize: 13, color: "#4a6fa0", textDecoration: "none" }}>← Voltar ao app</a>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f4f8ff", fontFamily: "Georgia, serif", marginBottom: 6 }}>
            Painel Ativar
          </h1>
          <p style={{ fontSize: 14, color: "#7a9ec8" }}>Gerencie ativações e lista de espera das ferramentas Ativar.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid #1e3a5f" }}>
          {(["ativacoes", "espera"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none",
                border: "none",
                borderBottom: tab === t ? "2px solid #1a7ff0" : "2px solid transparent",
                padding: "10px 20px",
                color: tab === t ? "#f4f8ff" : "#4a6fa0",
                fontSize: 14,
                fontWeight: tab === t ? 700 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                marginBottom: -1,
              }}
            >
              {t === "ativacoes" ? `Ativações (${activations.length})` : `Lista de Espera (${waitlist.length} ferramentas)`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#4a6fa0" }}>Carregando...</div>
        ) : tab === "ativacoes" ? (
          <div style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14, overflow: "hidden" }}>
            {activations.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#4a6fa0", fontSize: 14 }}>Nenhuma ativação ainda.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e3a5f" }}>
                    {["Data", "Cliente", "E-mail", "Ferramenta", "Área", "Status", "Valor"].map((h) => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".08em", textTransform: "uppercase" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activations.map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #1a2d47" }}>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "#7a9ec8" }}>
                        {new Date(a.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "#c8daf0", fontWeight: 600 }}>{a.client_name}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#7a9ec8" }}>{a.client_email}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "#e8f2ff" }}>{a.tool_name}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#7a9ec8", textTransform: "capitalize" }}>{a.gap_area}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: `${STATUS_COLOR[a.status]}18`, border: `1px solid ${STATUS_COLOR[a.status]}44`, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: STATUS_COLOR[a.status] }}>
                          {STATUS_LABEL[a.status] || a.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#00c896" }}>
                        R${a.price_monthly}/mês
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 14, overflow: "hidden" }}>
            {waitlist.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#4a6fa0", fontSize: 14 }}>Nenhuma entrada na lista de espera ainda.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e3a5f" }}>
                    {["Ferramenta", "Interessados"].map((h) => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".08em", textTransform: "uppercase" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {waitlist.map((w) => (
                    <tr key={w.tool_id} style={{ borderBottom: "1px solid #1a2d47" }}>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "#e8f2ff", fontWeight: 600 }}>{w.tool_name}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: Math.min(200, w.count * 20), height: 8, background: "linear-gradient(90deg,#f5c842,#ff8c00)", borderRadius: 4, transition: "width .4s", minWidth: 8 }} />
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#f5c842" }}>{w.count}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
