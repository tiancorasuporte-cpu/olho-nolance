import { Link, useRouterState } from "@tanstack/react-router";
import { ROLE_LABELS } from "../lib/api";
import { isAdmin, isPlayer, useAuth } from "../lib/auth";

const links = [
  { to: "/", label: "Ao vivo" },
  { to: "/botao-pc", label: "Botão PC" },
  { to: "/historico", label: "Histórico" },
  { to: "/quadras", label: "Quadras" },
  { to: "/cameras", label: "Câmeras" },
  { to: "/usuarios", label: "Usuários", admin: true },
  { to: "/propaganda", label: "Propaganda", admin: true },
  { to: "/devices", label: "Devices", admin: true },
  { to: "/configuracoes", label: "Configurações", admin: true },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 24px",
          borderBottom: "1px solid var(--line)",
          background: "rgba(10, 10, 10, 0.82)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/logo-icon.png"
              alt="ONL Sports"
              style={{ width: 44, height: 44, borderRadius: 10, display: "block" }}
            />
            <span className="brand" style={{ fontSize: 26, lineHeight: 1 }}>
              <span style={{ color: "var(--text)" }}>ONL</span>{" "}
              <span style={{ color: "var(--accent)" }}>SPORTS</span>
            </span>
          </Link>
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {links
              .filter((l) => (isPlayer(user) ? l.to === "/historico" : !l.admin || isAdmin(user)))
              .map((l) => {
                const active = pathname === l.to || (isPlayer(user) && l.to === "/historico");
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    style={{
                      padding: "6px 12px",
                      color: active ? "var(--bg)" : "var(--muted)",
                      background: active ? "var(--accent)" : "transparent",
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    {l.label}
                  </Link>
                );
              })}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted)" }}>
          <span>
            {user?.name} · {user ? ROLE_LABELS[user.role] : ""}
          </span>
          <button
            type="button"
            onClick={logout}
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--text)",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <main style={{ flex: 1, padding: "24px", maxWidth: 1200, width: "100%", margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
