import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

type Mode = "magic" | "login" | "register" | "forgot";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Pre-fill email from sessionStorage (set during diagnostic) or URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlEmail = params.get("email");
    const stored = sessionStorage.getItem("mapeia_lead_email");
    if (urlEmail) setEmail(urlEmail);
    else if (stored) setEmail(stored);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (mode === "magic") {
        const { error: err } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin + "/painel.html" },
        });
        if (err) throw err;
        setSuccess("Link enviado! Verifique seu e-mail e clique no link para acessar o painel.");
      } else if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === "register") {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.user) {
          await supabase.from("user_profiles").upsert({
            id: data.user.id,
            email,
            name,
            plan_tier: "free",
          });
        }
        setSuccess("Conta criada! Verifique seu e-mail para confirmar.");
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?reset=1`,
        });
        if (err) throw err;
        setSuccess("E-mail de recuperação enviado. Verifique sua caixa de entrada.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      if (msg.includes("Invalid login credentials")) setError("E-mail ou senha incorretos.");
      else if (msg.includes("User already registered")) setError("Este e-mail já está cadastrado. Faça login.");
      else if (msg.includes("Password should be")) setError("A senha deve ter pelo menos 6 caracteres.");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const modeLabel = {
    magic: "Acesso ao painel",
    login: "Entrar com senha",
    register: "Criar conta",
    forgot: "Recuperar senha",
  }[mode];

  const modeTitle = {
    magic: "Acesse seu painel",
    login: "Entrar na sua conta",
    register: "Criar sua conta",
    forgot: "Recuperar acesso",
  }[mode];

  const modeSub = {
    magic: "Informe seu e-mail e enviaremos um link seguro para acessar seus relatórios.",
    login: "Acesse seus relatórios e histórico de diagnósticos.",
    register: "Crie sua conta para acessar seu painel.",
    forgot: "Informe seu e-mail para receber o link de recuperação.",
  }[mode];

  return (
    <div style={{ minHeight: "100vh", background: "#040812", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Nav */}
      <nav style={{ padding: "20px 32px", borderBottom: "1px solid #1e3a5f", background: "#060c1a" }}>
        <a href="/" style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#f4f8ff", textDecoration: "none" }}>
          MapeIA <span style={{ color: "#00e5c8" }}>Brasil</span>
        </a>
      </nav>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ background: "#0d1d35", border: "1px solid #1e3a5f", borderRadius: 20, padding: "48px 40px", width: "100%", maxWidth: 440, boxShadow: "0 40px 100px rgba(0,0,0,.5)", position: "relative", overflow: "hidden" }}>
          {/* Glow */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 30% at 50% 0%, rgba(0,229,200,.06) 0%, transparent 60%)", pointerEvents: "none" }} />

          <div style={{ position: "relative" }}>
            <div style={{ display: "inline-block", background: "rgba(0,229,200,.1)", border: "1px solid rgba(0,229,200,.2)", color: "#00e5c8", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", padding: "5px 14px", borderRadius: 99, marginBottom: 20 }}>
              {modeLabel}
            </div>

            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "#f4f8ff", fontWeight: 400, marginBottom: 8, lineHeight: 1.2 }}>
              {modeTitle}
            </h1>
            <p style={{ fontSize: 14, color: "#7a9ec8", marginBottom: 32, lineHeight: 1.6 }}>
              {modeSub}
            </p>

            {error && (
              <div style={{ background: "rgba(255,64,85,.1)", border: "1px solid rgba(255,64,85,.3)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, color: "#ff8095", fontSize: 13 }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ background: "rgba(0,200,150,.1)", border: "1px solid rgba(0,200,150,.3)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, color: "#00e5c8", fontSize: 13 }}>
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {mode === "register" && (
                <div>
                  <label style={labelStyle}>Nome completo</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Seu nome" style={inputStyle} />
                </div>
              )}

              <div>
                <label style={labelStyle}>E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@empresa.com" style={inputStyle} />
              </div>

              {(mode === "login" || mode === "register") && (
                <div>
                  <label style={labelStyle}>Senha</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" style={inputStyle} />
                </div>
              )}

              <button type="submit" disabled={loading} style={{ background: "linear-gradient(135deg, #1a7ff0, #00b8d4)", color: "#fff", border: "none", padding: "14px 24px", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, marginTop: 4, transition: "all .2s", fontFamily: "inherit" }}>
                {loading ? "Aguarde..." : mode === "magic" ? "Enviar link de acesso →" : mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : "Enviar link"}
              </button>
            </form>

            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              {mode === "magic" && (
                <>
                  <button onClick={() => { setMode("login"); setError(""); setSuccess(""); }} style={linkBtnStyle}>
                    Prefiro entrar com <span style={{ color: "#00e5c8" }}>senha</span>
                  </button>
                  <button onClick={() => { setMode("register"); setError(""); setSuccess(""); }} style={linkBtnStyle}>
                    Ainda não tenho conta — <span style={{ color: "#00e5c8" }}>Cadastrar</span>
                  </button>
                </>
              )}
              {mode === "login" && (
                <>
                  <button onClick={() => { setMode("magic"); setError(""); setSuccess(""); }} style={linkBtnStyle}>
                    Entrar sem senha com <span style={{ color: "#00e5c8" }}>link por e-mail</span>
                  </button>
                  <button onClick={() => { setMode("forgot"); setError(""); }} style={linkBtnStyle}>
                    Esqueceu a senha?
                  </button>
                  <button onClick={() => { setMode("register"); setError(""); }} style={linkBtnStyle}>
                    Não tem conta? <span style={{ color: "#00e5c8" }}>Cadastre-se</span>
                  </button>
                </>
              )}
              {(mode === "register" || mode === "forgot") && (
                <button onClick={() => { setMode("magic"); setError(""); setSuccess(""); }} style={linkBtnStyle}>
                  Voltar — <span style={{ color: "#00e5c8" }}>entrar com link</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#7a9ec8", letterSpacing: ".05em", textTransform: "uppercase", display: "block", marginBottom: 6 };

const inputStyle: React.CSSProperties = { width: "100%", background: "#102240", border: "1.5px solid #1e3a5f", borderRadius: 10, padding: "12px 16px", fontSize: 16, color: "#f4f8ff", outline: "none", fontFamily: "inherit", transition: "border-color .15s" };

const linkBtnStyle: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#7a9ec8", fontFamily: "inherit" };
