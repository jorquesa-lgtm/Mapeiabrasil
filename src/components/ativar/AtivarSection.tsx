import { Layers } from "lucide-react";
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
}: AtivarSectionProps) {
  const gapTools = topGaps.slice(0, 3).map((gap) => ({
    gap,
    tool: getFirstToolForGap(gap),
  }));

  const hasAnyTool = gapTools.some((g) => g.tool);
  if (!hasAnyTool) return null;

  return (
    <div style={{ marginTop: 32 }}>
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
