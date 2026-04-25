import { useState } from "react";
import { X, CheckCircle, Loader } from "lucide-react";
import type { AtivarTool } from "../../config/ativarTools";
import { supabase } from "../../lib/supabase";

type Props = {
  tool: AtivarTool;
  diagnosticId: string;
  clientEmail: string;
  clientName: string;
  onClose: () => void;
};

type Step = 1 | 2 | 3;

export default function AtivarSetupModal({ tool, diagnosticId, clientEmail, clientName, onClose }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const whatsappField = tool.setupFields.find((f) => f.key === "whatsapp_number");
  const whatsappInSetup = Boolean(whatsappField);

  function allFilled() {
    return tool.setupFields.every((f) => (fields[f.key] || "").trim().length > 0);
  }

  async function handleConfirm() {
    const wNum = whatsappInSetup ? (fields["whatsapp_number"] || "").trim() : whatsapp.trim();
    if (!wNum) {
      setError("Informe o número do WhatsApp para continuar.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: dbErr } = await supabase.from("ativar_activations").insert({
      client_email: clientEmail,
      client_name: clientName,
      client_whatsapp: wNum,
      tool_id: tool.id,
      tool_name: tool.name,
      gap_area: tool.gapArea,
      setup_data: fields,
      status: "pending",
      price_monthly: tool.priceMonthly,
      ...(diagnosticId ? { diagnostic_id: diagnosticId } : {}),
    });
    setSaving(false);
    if (dbErr) {
      setError("Ocorreu um erro. Tente novamente.");
      return;
    }
    setStep(3);
  }

  const wNumDisplay = whatsappInSetup
    ? fields["whatsapp_number"] || ""
    : whatsapp;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(4,8,18,.8)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#0d1d35",
          border: "1px solid #1e3a5f",
          borderRadius: 18,
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,.6)",
          animation: "fadeIn .2s ease",
        }}
      >
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e3a5f", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#00c896", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
              {step === 3 ? "Ativação concluída" : `Ativar — Passo ${step} de 2`}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f4f8ff" }}>{tool.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#4a6fa0", padding: 4, display: "flex", alignItems: "center" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {/* Step 1: Setup fields */}
          {step === 1 && (
            <div style={{ animation: "fadeIn .2s ease" }}>
              <p style={{ fontSize: 13, color: "#7a9ec8", lineHeight: 1.6, marginBottom: 24 }}>
                Preencha as informações abaixo. Nossa equipe usará esses dados para configurar sua ferramenta em até 24 horas.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {tool.setupFields.map((f) => (
                  <div key={f.key}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#c8daf0", marginBottom: 6 }}>
                      {f.label}
                    </label>
                    {f.type === "select" && f.options ? (
                      <select
                        value={fields[f.key] || ""}
                        onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        style={{ width: "100%", background: "#102240", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 12px", color: fields[f.key] ? "#f4f8ff" : "#4a6fa0", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                      >
                        <option value="">{f.placeholder}</option>
                        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={f.type}
                        value={fields[f.key] || ""}
                        onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={{ width: "100%", background: "#102240", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 12px", color: "#f4f8ff", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => allFilled() && setStep(2)}
                disabled={!allFilled()}
                style={{
                  marginTop: 24,
                  width: "100%",
                  padding: "14px",
                  background: allFilled() ? "linear-gradient(135deg,#00b87a,#00c896)" : "#1a3355",
                  border: "none",
                  borderRadius: 10,
                  color: allFilled() ? "#fff" : "#4a6fa0",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: allFilled() ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  transition: "all .2s",
                }}
              >
                Continuar →
              </button>
            </div>
          )}

          {/* Step 2: Confirmation */}
          {step === 2 && (
            <div style={{ animation: "fadeIn .2s ease" }}>
              <div style={{ background: "#102240", border: "1px solid #1e3a5f", borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4a6fa0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Resumo da ativação</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tool.setupFields.map((f) => (
                    <div key={f.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 12, color: "#7a9ec8" }}>{f.label}</span>
                      <span style={{ fontSize: 12, color: "#c8daf0", fontWeight: 600, textAlign: "right", maxWidth: 240, wordBreak: "break-word" }}>{fields[f.key] || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "rgba(0,200,150,.06)", border: "1px solid rgba(0,200,150,.2)", borderRadius: 10, padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, color: "#c8daf0" }}>Cobrança mensal</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: "#00c896" }}>R${tool.priceMonthly}/mês</span>
              </div>
              <p style={{ fontSize: 12, color: "#4a6fa0", marginBottom: 20, textAlign: "center" }}>Cancele quando quiser, sem multa.</p>

              {!whatsappInSetup && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#c8daf0", marginBottom: 6 }}>
                    Seu número de WhatsApp (para confirmação)
                  </label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="+55 11 99999-9999"
                    style={{ width: "100%", background: "#102240", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 12px", color: "#f4f8ff", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                  />
                </div>
              )}

              {error && (
                <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(255,64,85,.08)", border: "1px solid rgba(255,64,85,.25)", borderRadius: 8, fontSize: 13, color: "#ff6070" }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setStep(1)}
                  style={{ flex: 1, padding: "13px", background: "none", border: "1px solid #1e3a5f", borderRadius: 10, color: "#7a9ec8", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  ← Voltar
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  style={{
                    flex: 2,
                    padding: "13px",
                    background: saving ? "#1a3355" : "linear-gradient(135deg,#00b87a,#00c896)",
                    border: "none",
                    borderRadius: 10,
                    color: saving ? "#4a6fa0" : "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {saving ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Ativando...</> : "Confirmar e Ativar →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div style={{ animation: "fadeIn .3s ease", textAlign: "center", padding: "12px 0" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <CheckCircle
                  size={64}
                  color="#00c896"
                  style={{ animation: "fadeIn .4s ease" }}
                />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: "#f4f8ff", marginBottom: 10, fontFamily: "Georgia, serif" }}>
                Sua ferramenta está sendo configurada!
              </h3>
              <p style={{ fontSize: 14, color: "#c8daf0", lineHeight: 1.7, marginBottom: 16 }}>
                Em até 24 horas você receberá uma mensagem no WhatsApp confirmando que tudo está pronto.
                {wNumDisplay && (
                  <> Fique atento ao número <strong style={{ color: "#00e5c8" }}>{wNumDisplay}</strong>.</>
                )}
              </p>
              <div style={{ padding: "14px 16px", background: "rgba(0,229,200,.05)", border: "1px solid rgba(0,229,200,.15)", borderRadius: 10, fontSize: 13, color: "#7a9ec8", lineHeight: 1.6, marginBottom: 24 }}>
                Nossa equipe cuidará de toda a integração técnica para você.
              </div>
              <button
                onClick={onClose}
                style={{ padding: "13px 32px", background: "linear-gradient(135deg,#1a7ff0,#00b8d4)", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
