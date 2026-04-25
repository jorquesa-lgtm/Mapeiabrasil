import { useState } from "react";
import { Zap } from "lucide-react";
import type { AtivarTool } from "../../config/ativarTools";
import AtivarSetupModal from "./AtivarSetupModal";

type Props = {
  tool: AtivarTool;
  diagnosticId: string;
  clientEmail: string;
  clientName: string;
};

export default function AtivarActiveCard({ tool, diagnosticId, clientEmail, clientName }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div
        style={{
          background: "linear-gradient(135deg,rgba(0,200,150,.07),rgba(0,229,200,.04))",
          border: "1px solid rgba(0,200,150,.3)",
          borderRadius: 16,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 0,
          transition: "box-shadow .2s",
        }}
      >
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f4f8ff", lineHeight: 1.4 }}>{tool.name}</div>
          <div style={{ flexShrink: 0, background: "rgba(0,200,150,.15)", border: "1px solid rgba(0,200,150,.3)", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#00c896", letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            Disponível
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
              style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#7a9ec8" }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* Price */}
        <div style={{ fontSize: 22, fontWeight: 700, color: "#00c896", marginBottom: 14 }}>
          R${tool.priceMonthly}<span style={{ fontSize: 13, fontWeight: 400, color: "#7a9ec8" }}>/mês</span>
        </div>

        {/* CTA */}
        <button
          onClick={() => setModalOpen(true)}
          style={{
            width: "100%",
            padding: "13px",
            background: "linear-gradient(135deg,#00b87a,#00c896)",
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: "0 8px 24px rgba(0,200,150,.2)",
            transition: "all .2s",
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 14px 32px rgba(0,200,150,.3)"; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 24px rgba(0,200,150,.2)"; }}
        >
          <Zap size={15} /> Ativar agora →
        </button>
        <p style={{ marginTop: 8, fontSize: 11, color: "#4a6fa0", textAlign: "center", lineHeight: 1.5 }}>
          Configuração automática em menos de 2 minutos. Cancele quando quiser.
        </p>
      </div>

      {modalOpen && (
        <AtivarSetupModal
          tool={tool}
          diagnosticId={diagnosticId}
          clientEmail={clientEmail}
          clientName={clientName}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
