import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import "./LoginPage.css";

type Mode = "login" | "register" | "confirm" | "forgot" | "reset";

function homeFor(user: User): "/lances" | "/" {
  return user.role === "player" ? "/lances" : "/";
}

export function LoginPage({ initialMode = "login" }: { initialMode?: Mode }) {
  const { login, applyToken, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false);

  // If already logged in (e.g. after confirm on /cadastro), leave this screen.
  useEffect(() => {
    if (!user || entering) return;
    void navigate({ to: homeFor(user), replace: true });
  }, [user, entering, navigate]);

  async function goHome(me: User, message: string) {
    setEntering(true);
    setInfo(message);
    setError(null);
    try {
      (document.activeElement as HTMLElement | null)?.blur?.();
    } catch {
      /* ignore */
    }
    // Brief pause so mobile users see "confirmado" before navigation.
    await new Promise((r) => window.setTimeout(r, 500));
    await navigate({ to: homeFor(me), replace: true });
  }

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setCode("");
    setPassword2("");
    if (next === "confirm" || next === "forgot" || next === "reset") {
      if (!email && username.includes("@")) setEmail(username);
    }
  }

  async function resend(purpose: "register" | "reset") {
    if (!email.trim()) {
      setError("Informe o e-mail");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.resendCode({ email, purpose });
      setInfo(res.message);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reenviar");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "login") {
        const me = await login(username.trim(), password);
        await goHome(me, "Login ok! Entrando…");
        return;
      }
      if (mode === "register") {
        if (password !== password2) throw new Error("As senhas não conferem");
        const res = await api.register({ name, email, password });
        setMode("confirm");
        setCode("");
        setPassword2("");
        setInfo(res.message);
        return;
      }
      if (mode === "confirm") {
        const { access_token } = await api.confirmEmail({ email, code });
        const me = await applyToken(access_token);
        await goHome(me, "E-mail confirmado! Entrando…");
        return;
      }
      if (mode === "forgot") {
        const res = await api.forgotPassword(email);
        setMode("reset");
        setCode("");
        setPassword("");
        setPassword2("");
        setInfo(res.message);
        return;
      }
      if (mode === "reset") {
        if (password !== password2) throw new Error("As senhas não conferem");
        const res = await api.resetPassword({ email, code, password });
        setUsername(email);
        setMode("login");
        setCode("");
        setPassword("");
        setPassword2("");
        setInfo(res.message);
      }
    } catch (err) {
      setEntering(false);
      setError(err instanceof Error ? err.message : "Falha na operação");
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<Mode, string> = {
    login: "Entrar",
    register: "Criar conta",
    confirm: "Confirmar e-mail",
    forgot: "Esqueci a senha",
    reset: "Nova senha",
  };

  if (entering) {
    return (
      <div className="login-root">
        <main className="login-center">
          <img src="/logo.png" alt="ONL Sports" className="login-logo" />
          <div className="login-card" style={{ textAlign: "center", gap: 14 }}>
            <div className="login-card-title">Pronto!</div>
            <div className="login-info">{info || "Entrando…"}</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Aguarde um instante…</div>
          </div>
        </main>
      </div>
    );
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
          <div className="login-card-title">{titles[mode]}</div>

          {mode === "login" && (
            <>
              <label className="login-field">
                <span>E-mail ou usuário</span>
                <input
                  type="text"
                  inputMode="email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="seu@email.com"
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
            </>
          )}

          {mode === "register" && (
            <>
              <label className="login-field">
                <span>Nome</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </label>
              <label className="login-field">
                <span>E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="login-field">
                <span>Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <label className="login-field">
                <span>Confirmar senha</span>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
            </>
          )}

          {(mode === "confirm" || mode === "forgot" || mode === "reset") && (
            <label className="login-field">
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus={mode !== "reset" && mode !== "confirm"}
              />
            </label>
          )}

          {(mode === "confirm" || mode === "reset") && (
            <>
              <p className="login-info" style={{ margin: 0 }}>
                Abra o e-mail mais recente da ONL Sports e digite só os 6 números do código.
              </p>
              <label className="login-field">
                <span>Código do e-mail (6 dígitos)</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={7}
                  placeholder="000000"
                  required
                  autoFocus
                  enterKeyHint="done"
                />
              </label>
            </>
          )}

          {mode === "reset" && (
            <>
              <label className="login-field">
                <span>Nova senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <label className="login-field">
                <span>Confirmar senha</span>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
            </>
          )}

          {error && <div className="login-error">{error}</div>}
          {info && <div className="login-info">{info}</div>}

          <button type="submit" disabled={loading || entering} className="login-submit">
            {loading
              ? "Aguarde…"
              : mode === "login"
                ? "Entrar"
                : mode === "register"
                  ? "Cadastrar"
                  : mode === "confirm"
                    ? "Confirmar"
                    : mode === "forgot"
                      ? "Enviar código"
                      : "Salvar senha"}
            <span className="login-submit-icon" aria-hidden>
              ›
            </span>
          </button>

          <div className="login-links">
            {mode === "login" && (
              <>
                <button type="button" className="login-link" onClick={() => go("forgot")}>
                  Esqueci a senha
                </button>
                <button type="button" className="login-link" onClick={() => go("register")}>
                  Sou participante — criar conta
                </button>
              </>
            )}
            {mode === "register" && (
              <button type="button" className="login-link" onClick={() => go("login")}>
                Já tenho conta — entrar
              </button>
            )}
            {mode === "confirm" && (
              <>
                <button type="button" className="login-link" disabled={loading} onClick={() => void resend("register")}>
                  Não recebi — reenviar código
                </button>
                <button type="button" className="login-link" onClick={() => go("login")}>
                  Já confirmei — entrar
                </button>
              </>
            )}
            {mode === "reset" && (
              <button type="button" className="login-link" disabled={loading} onClick={() => void resend("reset")}>
                Reenviar código
              </button>
            )}
            {(mode === "forgot" || mode === "reset") && (
              <button type="button" className="login-link" onClick={() => go("login")}>
                Voltar ao login
              </button>
            )}
          </div>
        </form>

        <p className="login-foot">Play · Registra · Compartilha</p>
      </main>
    </div>
  );
}
