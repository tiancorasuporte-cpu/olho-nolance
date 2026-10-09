import { useState } from "react";
import { useAuth } from "../lib/auth";
import "./LoginPage.css";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="login-root">
      <div className="login-shapes" aria-hidden>
        <span className="pill p1" />
        <span className="pill p2" />
        <span className="pill p3" />
        <span className="dot d1" />
        <span className="dot d2" />
        <span className="plus x1">+</span>
        <span className="plus x2">+</span>
        <span className="plus x3">+</span>
        <span className="spark" />
      </div>

      <main className="login-center">
        <img src="/logo.png" alt="ONL Sports" className="login-logo" />

        <form onSubmit={onSubmit} className="login-card">
          <label className="login-field">
            <span>Usuário</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label className="login-field">
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading} className="login-submit">
            {loading ? "Entrando…" : "Entrar"}
            <span className="login-submit-icon" aria-hidden>
              ›
            </span>
          </button>
        </form>

        <p className="login-foot">Play · Registra · Compartilha</p>
      </main>
    </div>
  );
}
