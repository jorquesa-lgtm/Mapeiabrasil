import { useEffect, useState } from "react";
import { Layers, CheckCircle, X } from "lucide-react";
import { getFirstToolForGap } from "../../config/ativarTools";
import AtivarActiveCard from "./AtivarActiveCard";
import AtivarComingSoonCard from "./AtivarComingSoonCard";

type AtivarSectionProps = {
  topGaps: string[];
  diagnosticId: string;
  clientEmail: string;
  clientName: string;
  sector: string;
  diagnosticScore: number;
  // Set when returning from Stripe with ?ativar_success=1&activation_id=xxx
  activationSuccessId?: string | null;
};

const AREA_PT: Record<string, string> = {
  infra: "Infraestrutura",
  process: "Processos",
  ai: "IA & Automação",
  data: "Dados",
  sales: "Vendas",
  service: "Atendimento",
  financial: "Financeiro",
};

export default function AtivarSection({
  topGaps,
  diagnosticId,
  clientEmail,
  clientName,
  sector,
  diagnosticScore,
  activationSuccessId,
}: AtivarSectionProps) {
  const [successDismissed, setSuccessDismissed] = useState(false);

  // Clean up URL params so a refresh doesn't re-show the banner
  useEffect(() => {
    if (activationSuccessId && !successDismissed) {
      const url = new URL(window.location.href);
      url.searchParams.delete("ativar_success");
      url.searchParams.delete("ativar_cancel");
      url.searchParams.delete("activation_id");
      window.history.replaceState({}, "", url.toString());
    }
  }, [activationSuccessId, successDismissed]);

  const gapTools = topGaps.slice(0, 3).map((gap) => ({
    gap,
    tool: getFirstToolForGap(gap),
  }));

  const hasAnyTool = gapTools.some((g) => g.tool);
  if (!hasAnyTool) return null;

  return (
    <div style={{ marginTop: 32 }}>
      {/* Post-payment success banner */}
      {activationSuccessId && !successDismissed && (
        <div style={{
          marginBottom: 20,
          padding: "16px 20px",
          background: "rgba(0,200,150,.08)",
          border: "1px solid rgba(0,200,150,.3)",
          borderRadius: 12,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          animation: "fadeIn .3s ease",
        }}>
          <CheckCircle size={20} color="#00c896" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f4f8ff", marginBottom: 3 }}>
              Pagamento confirmado! Sua ferramenta está sendo configurada.
            </div>
            <div style={{ fontSize: 13, color: "#7a9ec8", lineHeight: 1.5 }}>
              Em até 24 horas você receberá uma mensagem no WhatsApp confirmando que está tudo pronto.
              Nossa equipe cuidará de toda a integração técnica.
            </div>
          </div>
          <button
            onClick={() => setSuccessDismissed(true)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#4a6fa0", padding: 2, flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 32, height: 32, background: "rgba(26,127,240,.12)", border: "1px solid rgba(26,127,240,.25)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Layers size={16} color="#4da6ff" />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase" }}>
            Ativar
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#f4f8ff", margin: 0 }}>
            Ative as soluções para os seus gaps
          </h3>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "#7a9ec8", lineHeight: 1.6, marginBottom: 20, paddingLeft: 42 }}>
        Com base no seu diagnóstico, identificamos as ferramentas certas para o seu negócio.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        {gapTools.map(({ gap, tool }) => {
          const areaLabel = AREA_PT[gap] || gap;

          if (!tool) {
            return (
              <div
                key={gap}
                style={{ background: "rgba(30,58,95,.2)", border: "1px solid #1e3a5f", borderRadius: 16, padding: 24 }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>
                  {areaLabel}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#7a9ec8" }}>Em análise</div>
                <p style={{ fontSize: 12, color: "#4a6fa0", lineHeight: 1.5, marginTop: 6 }}>
                  Estamos desenvolvendo soluções específicas para esta área. Em breve!
                </p>
              </div>
            );
          }

          return (
            <div key={gap}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>
                Gap: {areaLabel}
              </div>
              {tool.status === "active" ? (
                <AtivarActiveCard
                  tool={tool}
                  diagnosticId={diagnosticId}
                  clientEmail={clientEmail}
                  clientName={clientName}
                />
              ) : (
                <AtivarComingSoonCard
                  tool={tool}
                  clientEmail={clientEmail}
                  clientName={clientName}
                  sector={sector}
                  diagnosticScore={diagnosticScore}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
