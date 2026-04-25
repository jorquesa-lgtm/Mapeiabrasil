import { useState } from "react";
import { supabase } from "../lib/supabase";

type Mode = "login" | "register" | "forgot";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (mode === "login") {
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
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?reset=1`,
        });
        if (err) throw err;
        setSuccess("E-mail de recuperacao enviado. Verifique sua caixa de entrada.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      if (msg.includes("Invalid login credentials")) setError("E-mail ou senha incorretos.");
      else if (msg.includes("User already registered")) setError("Este e-mail ja esta cadastrado. Faca login.");
      else if (msg.includes("Password should be")) setError("A senha deve ter pelo menos 6 caracteres.");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#040812",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Nav */}
      <nav style={{ padding: "20px 32px", borderBottom: "1px solid #1e3a5f", background: "#060c1a" }}>
        <a href="/" style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#f4f8ff", textDecoration: "none" }}>
          MapeIA <span style={{ color: "#00e5c8" }}>Brasil</span>
        </a>
      </nav>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div
          style={{
            background: "#0d1d35",
            border: "1px solid #1e3a5f",
            borderRadius: 20,
            padding: "48px 40px",
            width: "100%",
            maxWidth: 440,
            boxShadow: "0 40px 100px rgba(0,0,0,.5)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Glow */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 30% at 50% 0%, rgba(0,229,200,.06) 0%, transparent 60%)", pointerEvents: "none" }} />

          <div style={{ position: "relative" }}>
            {/* Badge */}
            <div style={{ display: "inline-block", background: "rgba(0,229,200,.1)", border: "1px solid rgba(0,229,200,.2)", color: "#00e5c8", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", padding: "5px 14px", borderRadius: 99, marginBottom: 20 }}>
              {mode === "login" ? "Acesso restrito" : mode === "register" ? "Criar conta" : "Recuperar senha"}
            </div>

            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "#f4f8ff", fontWeight: 400, marginBottom: 8, lineHeight: 1.2 }}>
              {mode === "login" ? "Entrar na sua conta" : mode === "register" ? "Criar sua conta" : "Recuperar acesso"}
            </h1>
            <p style={{ fontSize: 14, color: "#7a9ec8", marginBottom: 32, lineHeight: 1.6 }}>
              {mode === "login"
                ? "Acesse seus relatorios e historico de diagnosticos."
                : mode === "register"
                ? "Crie sua conta para acessar o painel Evolucao."
                : "Informe seu e-mail para receber o link de recuperacao."}
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
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#7a9ec8", letterSpacing: ".05em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                    Nome completo
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Seu nome"
                    style={inputStyle}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#7a9ec8", letterSpacing: ".05em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="voce@empresa.com"
                  style={inputStyle}
                />
              </div>

              {mode !== "forgot" && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#7a9ec8", letterSpacing: ".05em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                    Senha
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    style={inputStyle}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  background: "linear-gradient(135deg, #1a7ff0, #00b8d4)",
                  color: "#fff",
                  border: "none",
                  padding: "14px 24px",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  marginTop: 4,
                  transition: "all .2s",
                  fontFamily: "inherit",
                }}
              >
                {loading
                  ? "Aguarde..."
                  : mode === "login"
                  ? "Entrar"
                  : mode === "register"
                  ? "Criar conta"
                  : "Enviar link"}
              </button>
            </form>

            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              {mode === "login" && (
                <>
                  <button onClick={() => { setMode("forgot"); setError(""); }} style={linkBtnStyle}>
                    Esqueceu a senha?
                  </button>
                  <button onClick={() => { setMode("register"); setError(""); }} style={linkBtnStyle}>
                    Nao tem conta? <span style={{ color: "#00e5c8" }}>Cadastre-se</span>
                  </button>
                </>
              )}
              {(mode === "register" || mode === "forgot") && (
                <button onClick={() => { setMode("login"); setError(""); setSuccess(""); }} style={linkBtnStyle}>
                  Ja tenho conta — <span style={{ color: "#00e5c8" }}>Entrar</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#102240",
  border: "1.5px solid #1e3a5f",
  borderRadius: 10,
  padding: "12px 16px",
  fontSize: 15,
  color: "#f4f8ff",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color .15s",
};

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  color: "#7a9ec8",
  fontFamily: "inherit",
};
