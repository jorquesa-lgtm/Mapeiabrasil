import React, { useState, useRef, useEffect } from "react";
import { X, Send, Bot, Loader, ChevronDown } from "lucide-react";
import { supabase } from "../lib/supabase";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DiagnosticContext {
  company: string;
  name?: string;
  sector: string;
  score: number;
  maturity: string;
  area_scores: Record<string, number>;
  quick_wins: Array<{ title: string; description?: string; tool?: string }>;
  roadmap: Record<string, { title: string; actions?: Array<{ title: string; description?: string; tool?: string }> }>;
  gaps: Array<{ title: string; severity: string; area?: string }>;
  kit_recommended?: string;
  kit_subscriptions?: string[];
  email?: string;
}

interface CopilotDrawerProps {
  context: DiagnosticContext | null;
}

const SUGGESTED = [
  "Por onde eu começo?",
  "Como instalo o Kit recomendado?",
  "Explica meu maior gap",
  "Qual é o primeiro quick win?",
  "Como conectar o Z-API ao Make?",
];

const MATURITY: Record<string, string> = {
  "1": "Inicial", "2": "Em Despertar", "3": "Em Transição",
  "4": "Escalável", "5": "Avançado",
};

export default function CopilotDrawer({ context }: CopilotDrawerProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGreeted, setHasGreeted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
      if (!hasGreeted && context) {
        const greeting: Message = {
          role: "assistant",
          content: (() => {
            const kitMap: Record<string, string> = {
              kit_kit1:"Atendente 24h", kit_kit2:"Follow-up de Leads",
              kit_kit3:"Agendamento Anti-No-Show", kit_kit4:"Cobrança Amigável",
              kit_kit5:"Presença Social", kit_bundle:"Pacote Completo",
            };
            const kitNames = (context.kit_subscriptions ?? []).map(p => kitMap[p] || p).filter(Boolean);
            const kitLine = kitNames.length > 0
              ? `\n\nVejo que você assinou: **${kitNames.join(", ")}**. Conheço cada passo de instalação e estou pronto para guiar você.`
              : "";
            return `Olá! Sou o Copiloto de Implementação da MapeAI Brasil para **${context.company}**.\n\nConheço o diagnóstico completo — score **${context.score}/100**, seus gaps e o plano 30/60/90.${kitLine}\n\nEstou aqui para te guiar passo a passo. Por onde quer começar?`;
          })(),
        };
        setMessages([greeting]);
        setHasGreeted(true);
      }
    }
  }, [open, hasGreeted, context]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading || !context) return;

    setInput("");
    setError(null);

    const userMsg: Message = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("copilot", {
        body: {
          messages: newMessages.filter(m => m.role !== "assistant" || newMessages.indexOf(m) > 0),
          context,
        },
      });

      if (fnErr) throw fnErr;

      const reply = data?.reply ?? "Não consegui gerar uma resposta. Tente novamente.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error("Copilot error:", err);
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Render markdown-lite (bold + line breaks)
  function renderContent(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      return (
        <span key={i}>
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j} style={{ color: "#e8f4ff", fontWeight: 700 }}>{part}</strong> : part
          )}
          {i < text.split("\n").length - 1 && <br />}
        </span>
      );
    });
  }

  if (!context) return null;

  return (
    <>
      {/* ── Floating trigger button ── */}
      <button
        onClick={() => setOpen(true)}
        title="Copiloto MapeAI — ajuda com implementação"
        style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 900,
          width: 58, height: 58, borderRadius: "50%",
          background: "linear-gradient(135deg, #00b8a0, #00e5c8)",
          border: "none", cursor: "pointer", display: open ? "none" : "flex",
          alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 32px rgba(0,229,200,.4), 0 2px 8px rgba(0,0,0,.4)",
          transition: "transform .2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
      >
        <Bot size={26} color="#04080f" strokeWidth={2} />
        {/* Pulse ring */}
        <span style={{
          position: "absolute", inset: -4, borderRadius: "50%",
          border: "2px solid rgba(0,229,200,.4)",
          animation: "pulse 2s ease-in-out infinite",
        }} />
      </button>

      {/* ── Drawer ── */}
      <div data-copilot-shell={open ? "open" : undefined} style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 950,
        width: open ? 420 : 0, maxWidth: "100vw",
        transition: "width .3s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
        boxShadow: open ? "-8px 0 48px rgba(0,0,0,.5)" : "none",
      }}>
        <div data-copilot-drawer style={{
          width: 420, maxWidth: "100vw", height: "100%",
          background: "#060e1c", borderLeft: "1px solid #1a3050",
          display: "flex", flexDirection: "column",
          fontFamily: "'DM Sans', sans-serif",
        }}>

          {/* Header */}
          <div style={{
            padding: "16px 20px", borderBottom: "1px solid #1a3050",
            display: "flex", alignItems: "center", gap: 12,
            background: "linear-gradient(135deg, #071828, #0a1e38)",
            flexShrink: 0,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "linear-gradient(135deg, #00b8a0, #00e5c8)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Bot size={20} color="#04080f" strokeWidth={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e8f4ff" }}>
                Copiloto MapeAI
              </div>
              <div style={{ fontSize: 11, color: "#00e5c8", fontWeight: 600 }}>
                {context.company}{context.name && context.name !== context.company ? ` · ${context.name}` : ""} · Score {context.score}/100
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00c896" }} />
              <span style={{ fontSize: 11, color: "#00c896", fontWeight: 600 }}>online</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#4a6fa0", padding: 4, display: "flex", borderRadius: 6, transition: "color .15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e8f4ff")}
              onMouseLeave={e => (e.currentTarget.style.color = "#4a6fa0")}
            >
              <ChevronDown size={18} />
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#4a6fa0", padding: 4, display: "flex", borderRadius: 6, transition: "color .15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#ff4a6b")}
              onMouseLeave={e => (e.currentTarget.style.color = "#4a6fa0")}
            >
              <X size={18} />
            </button>
          </div>

          {/* Context pill */}
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #0f2040", background: "#040e1c", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(context.area_scores)
                .sort(([, a], [, b]) => a - b)
                .slice(0, 3)
                .map(([key, score]) => (
                  <span key={key} style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px",
                    borderRadius: 99, border: "1px solid #1a3050",
                    background: score < 30 ? "rgba(255,74,107,.08)" : "rgba(255,200,66,.06)",
                    color: score < 30 ? "#ff7a8a" : "#c8a830",
                  }}>
                    {({ infra:"Infra", process:"Processos", ai:"IA", data:"Dados", sales:"Vendas", service:"Atendimento" } as Record<string,string>)[key] ?? key}: {score}
                  </span>
                ))}
              <span style={{ fontSize: 10, color: "#2a4060", margin: "auto 0 auto auto" }}>
                áreas mais fracas
              </span>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 16px" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e8f4ff", marginBottom: 6 }}>Copiloto de Implementação</div>
                <div style={{ fontSize: 13, color: "#4a6fa0", lineHeight: 1.6 }}>
                  Conheço o diagnóstico de {context.company} e estou aqui para te guiar na implementação, passo a passo.
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 12,
                gap: 8,
              }}>
                {msg.role === "assistant" && (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#00b8a0,#00e5c8)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                    <Bot size={14} color="#04080f" strokeWidth={2} />
                  </div>
                )}
                <div style={{
                  maxWidth: "82%",
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: msg.role === "user" ? "linear-gradient(135deg,#1060c0,#1a7ff0)" : "#0d1d35",
                  border: msg.role === "user" ? "none" : "1px solid #1a3050",
                  fontSize: 13, lineHeight: 1.65, color: "#c8daf0",
                }}>
                  {renderContent(msg.content)}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#00b8a0,#00e5c8)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Bot size={14} color="#04080f" strokeWidth={2} />
                </div>
                <div style={{ padding: "10px 16px", borderRadius: "14px 14px 14px 4px", background: "#0d1d35", border: "1px solid #1a3050", display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader size={13} color="#00e5c8" style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 12, color: "#4a6fa0" }}>Gerando resposta...</span>
                </div>
              </div>
            )}

            {error && (
              <div style={{ fontSize: 12, color: "#ff7a8a", textAlign: "center", padding: "8px", background: "rgba(255,74,107,.08)", borderRadius: 8, marginBottom: 8 }}>
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Suggestions (show only at start) */}
          {messages.length <= 1 && (
            <div style={{ padding: "0 16px 12px", flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: "#2a4060", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                Sugestões
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SUGGESTED.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      background: "rgba(0,229,200,.06)", border: "1px solid rgba(0,229,200,.15)",
                      borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "#6ab4b0",
                      cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,229,200,.4)"; e.currentTarget.style.color = "#00e5c8"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,229,200,.15)"; e.currentTarget.style.color = "#6ab4b0"; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: "12px 16px 20px", borderTop: "1px solid #1a3050",
            background: "#040e1c", flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Pergunta sobre implementação..."
                rows={1}
                disabled={loading}
                style={{
                  flex: 1, background: "#0d1d35", border: "1px solid #1a3050",
                  borderRadius: 10, padding: "10px 14px", fontSize: 13,
                  color: "#e8f4ff", fontFamily: "inherit", resize: "none",
                  outline: "none", transition: "border-color .15s",
                  maxHeight: 120, overflowY: "auto", lineHeight: 1.5,
                  opacity: loading ? 0.6 : 1,
                }}
                onFocus={e => (e.target.style.borderColor = "#00e5c8")}
                onBlur={e => (e.target.style.borderColor = "#1a3050")}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 120) + "px";
                }}
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                style={{
                  width: 38, height: 38, borderRadius: 10, border: "none",
                  background: input.trim() && !loading ? "linear-gradient(135deg,#00b8a0,#00e5c8)" : "#0d1d35",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, transition: "all .2s",
                }}
              >
                <Send size={16} color={input.trim() && !loading ? "#04080f" : "#2a4060"} strokeWidth={2} />
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#1e3050", marginTop: 8, textAlign: "center" }}>
              Apenas sobre implementação do diagnóstico · MapeAI Brasil
            </div>
          </div>

        </div>
      </div>

      {/* Backdrop (mobile) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 940, background: "rgba(0,0,0,.4)", display: "none" }}
        />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.15)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @media(max-width:480px){ [data-copilot-drawer]{ width:100vw!important; } [data-copilot-shell]{ width:100vw!important; } }
      `}</style>
    </>
  );
}
