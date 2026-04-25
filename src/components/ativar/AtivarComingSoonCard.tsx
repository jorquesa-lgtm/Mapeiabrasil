import { useState } from "react";
import { Bell, Check } from "lucide-react";
import type { AtivarTool } from "../../config/ativarTools";
import { supabase } from "../../lib/supabase";

type Props = {
  tool: AtivarTool;
  clientEmail: string;
  clientName: string;
  sector: string;
  diagnosticScore: number;
};

export default function AtivarComingSoonCard({ tool, clientEmail, clientName, sector, diagnosticScore }: Props) {
  const [notified, setNotified] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleNotify() {
    if (notified || loading) return;
    setLoading(true);
    await supabase.from("ativar_waitlist").insert({
      client_email: clientEmail,
      client_name: clientName,
      tool_id: tool.id,
      tool_name: tool.name,
      gap_area: tool.gapArea,
      sector,
      diagnostic_score: diagnosticScore,
    });
    setLoading(false);
    setNotified(true);
  }

  return (
    <div
      style={{
        background: "linear-gradient(135deg,rgba(245,200,66,.06),rgba(255,140,0,.04))",
        border: "1px solid rgba(245,200,66,.25)",
        borderRadius: 16,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        opacity: 0.9,
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f4f8ff", lineHeight: 1.4 }}>{tool.name}</div>
        <div style={{ flexShrink: 0, background: "rgba(245,200,66,.12)", border: "1px solid rgba(245,200,66,.3)", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#f5c842", letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Em breve
        </div>
      </div>

      {/* Description */}
      <p
        style={{ fontSize: 13, color: "#c8daf0", lineHeight: 1.6, marginBottom: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}
      >
        {tool.description}
      </p>

      {/* Underlying tools badges */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {tool.underlyingTools.map((t) => (
          <span
            key={t}
            style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#4a6fa0" }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* Price (greyed out) */}
      <div style={{ fontSize: 22, fontWeight: 700, color: "#4a6fa0", marginBottom: 14, position: "relative", display: "inline-flex", alignItems: "baseline", gap: 8 }}>
        R${tool.priceMonthly}<span style={{ fontSize: 13, fontWeight: 400 }}>/mês</span>
        <span style={{ fontSize: 12, color: "#f5c842", fontWeight: 600, marginLeft: 8 }}>• Em breve</span>
      </div>

      {/* CTA */}
      <button
        onClick={handleNotify}
        disabled={notified || loading}
        style={{
          width: "100%",
          padding: "13px",
          background: notified ? "rgba(0,200,150,.08)" : "transparent",
          border: `1px solid ${notified ? "rgba(0,200,150,.3)" : "rgba(245,200,66,.4)"}`,
          borderRadius: 10,
          color: notified ? "#00c896" : "#f5c842",
          fontSize: 13,
          fontWeight: 700,
          cursor: notified ? "default" : "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "all .2s",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {notified ? (
          <><Check size={15} /> Você será notificado!</>
        ) : loading ? (
          "Salvando..."
        ) : (
          <><Bell size={15} /> Me avise quando estiver disponível</>
        )}
      </button>
    </div>
  );
}
