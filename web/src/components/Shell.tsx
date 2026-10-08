import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ROLE_LABELS } from "../lib/api";
import { isAdmin, isPlayer, useAuth } from "../lib/auth";

const links = [
  { to: "/", label: "Ao vivo" },
  { to: "/botao-pc", label: "Botão PC" },
  { to: "/historico", label: "Histórico" },
  { to: "/quadras", label: "Quadras" },
  { to: "/usuarios", label: "Usuários", admin: true },
  { to: "/propaganda", label: "Propaganda", admin: true },
  { to: "/configuracoes", label: "Configurações", admin: true },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const visibleLinks = links.filter((l) =>
    isPlayer(user) ? l.to === "/historico" : !l.admin || isAdmin(user),
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="app-header">
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
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

        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>

        <div className={`app-nav-wrap${menuOpen ? " open" : ""}`}>
          <nav className="app-nav">
            {visibleLinks.map((l) => {
              const active =
                pathname === l.to ||
                (l.to !== "/" && pathname.startsWith(`${l.to}/`)) ||
                (isPlayer(user) && l.to === "/historico");
              return (
                <Link key={l.to} to={l.to} className={`app-nav-link${active ? " active" : ""}`}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="app-user">
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
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
