import { useState } from "react";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="login-smoke s1" />
      <div className="login-smoke s2" />
      <div className="login-smoke s3" />

      <section className="login-hero">
        <div className="login-art">
          <img src="/login-art.png" alt="" />
        </div>
        <div className="login-caption">
          <h1>Olho no Lance</h1>
          <p>Play · Registra · Compartilha. O replay do seu jogo, pronto para postar.</p>
        </div>
      </section>

      <form onSubmit={onSubmit} className="login-panel">
        <img src="/logo.png" alt="ONL Sports" className="login-logo" />
        <div className="login-tabs">
          <span className="active">Entrar</span>
        </div>

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
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{ paddingRight: 64 }}
            />
            <button
              type="button"
              className="login-peek"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? "ocultar" : "mostrar"}
            </button>
          </div>
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" disabled={loading} className="login-submit">
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <p className="login-foot">ONL Sports · Olho no Lance</p>
      </form>
    </div>
  );
}
