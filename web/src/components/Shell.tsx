import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ROLE_LABELS } from "../lib/api";
import { isAdmin, isGlobalAdmin, isPlayer, useAuth } from "../lib/auth";

const links = [
  { to: "/", label: "Ao vivo" },
  { to: "/botao-pc", label: "Botão PC" },
  { to: "/lances", label: "Lances" },
  { to: "/quadras", label: "Quadras" },
  { to: "/usuarios", label: "Usuários", admin: true },
  { to: "/propaganda", label: "Propaganda", admin: true },
  { to: "/configuracoes", label: "Configurações", admin: true, global: true },
];

function initials(name?: string) {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const visibleLinks = links.filter((l) => {
    if (isPlayer(user)) return l.to === "/lances";
    if ("global" in l && l.global) return isGlobalAdmin(user);
    return !l.admin || isAdmin(user);
  });

  const current =
    links.find((l) => l.to !== "/" && (pathname === l.to || pathname.startsWith(`${l.to}/`))) ||
    (pathname === "/" ? links[0] : undefined);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="app-header">
        <Link to="/" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <img src="/logo.png" alt="ONL Sports" style={{ height: 48, width: "auto", display: "block" }} />
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
                (isPlayer(user) && l.to === "/lances");
              return (
                <Link key={l.to} to={l.to} className={`app-nav-link${active ? " active" : ""}`}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="app-user">
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className="avatar">{initials(user?.name)}</span>
              <span style={{ display: "grid", lineHeight: 1.25, minWidth: 0 }}>
                <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 500 }}>{user?.name}</span>
                <span style={{ fontSize: 12 }}>{user ? ROLE_LABELS[user.role] : ""}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={logout}
              style={{
                background: "var(--card-2)",
                border: "1px solid var(--line)",
                color: "var(--text)",
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">
        {current && (
          <div className="crumbs">
            Páginas / <b>{current.label}</b>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
