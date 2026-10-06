import { useState } from "react";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("superadmin");
  const [password, setPassword] = useState("ancora");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        className="fade-up"
        style={{
          width: "min(420px, 100%)",
          padding: 32,
          background: "rgba(20, 20, 20, 0.88)",
          border: "1px solid var(--line)",
          display: "grid",
          gap: 16,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <img
            src="/logo.png"
            alt="ONL Sports · Olho no Lance"
            style={{ width: "100%", maxWidth: 340, display: "block", margin: "0 auto" }}
          />
          <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
            Play · Registra · Compartilha
          </p>
        </div>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Usuário</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle}
            autoComplete="username"
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete="current-password"
          />
        </label>
        {error && <div style={{ color: "var(--danger)", fontSize: 14 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{
            ...btnPrimary,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.25)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  padding: "10px 12px",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  padding: "12px 16px",
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.04em",
};
