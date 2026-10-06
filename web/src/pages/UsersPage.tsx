import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { api, ROLE_LABELS, type Role } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";

export function UsersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list, enabled: isAdmin(user) });
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const [query, setQuery] = useState("");
  const venueName = (id: number) => venues.data?.find((v) => v.id === id)?.name || `#${id}`;
  const allUsers = users.data || [];
  const visibleUsers = allUsers.filter((u) =>
    matchesSearch(query, u.name, u.username, u.role, ROLE_LABELS[u.role], ...u.venue_ids.map(venueName)),
  );
  const [venueQuery, setVenueQuery] = useState("");
  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    role: "operator" as Role,
    venue_ids: [] as number[],
  });

  const venueResults = venueQuery.trim()
    ? (venues.data || [])
        .filter(
          (v) =>
            !form.venue_ids.includes(v.id) &&
            matchesSearch(venueQuery, v.name, v.city, v.description, String(v.id)),
        )
        .slice(0, 8)
    : [];
  const addVenue = (id: number) => {
    setForm({ ...form, venue_ids: [...form.venue_ids, id] });
    setVenueQuery("");
  };

  const create = useMutation({
    mutationFn: () => api.users.create(form),
    onSuccess: () => {
      setForm({ username: "", password: "", name: "", role: "operator", venue_ids: [] });
      setVenueQuery("");
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.users.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["users"] }),
  });

  if (!isAdmin(user)) {
    return <div style={{ color: "var(--muted)" }}>Acesso restrito a admins.</div>;
  }

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>USUÁRIOS</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          Operador aciona lances nas quadras liberadas. Participante só acessa o Histórico: busca
          a quadra pelo nome ou cidade, assiste e baixa os lances.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        style={{
          display: "grid",
          gap: 10,
          padding: 16,
          border: "1px solid var(--line)",
          background: "rgba(26,26,26,0.7)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }} className="user-form">
          <input
            required
            placeholder="Nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={inputStyle}
          />
          <input
            required
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            style={inputStyle}
          />
          <input
            required
            type="password"
            placeholder="Senha"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={inputStyle}
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            style={inputStyle}
          >
            <option value="player">{ROLE_LABELS.player}</option>
            <option value="operator">{ROLE_LABELS.operator}</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
            {user?.role === "superadmin" && <option value="superadmin">{ROLE_LABELS.superadmin}</option>}
          </select>
        </div>
        {form.role === "operator" && (
          <div style={{ display: "grid", gap: 8 }}>
            {form.venue_ids.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {form.venue_ids.map((id) => (
                  <span key={id} style={chipStyle}>
                    {venueName(id)}
                    <button
                      type="button"
                      aria-label="Remover quadra"
                      onClick={() => setForm({ ...form, venue_ids: form.venue_ids.filter((x) => x !== id) })}
                      style={chipRemoveStyle}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ position: "relative" }}>
              <input
                value={venueQuery}
                onChange={(e) => setVenueQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (venueResults[0]) addVenue(venueResults[0].id);
                  }
                }}
                placeholder="Digite o nome, cidade ou ID da quadra para adicionar…"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              />
              {venueQuery.trim() && (
                <div style={dropdownStyle}>
                  {venueResults.length === 0 && (
                    <div style={{ padding: "10px 12px", color: "var(--muted)" }}>Nenhuma quadra encontrada.</div>
                  )}
                  {venueResults.map((v) => (
                    <button key={v.id} type="button" onClick={() => addVenue(v.id)} style={dropdownItemStyle}>
                      <strong>{v.name}</strong>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        {v.city ? ` · ${v.city}` : ""} · ID {v.id}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <button type="submit" style={btnStyle} disabled={create.isPending}>
          Criar usuário
        </button>
      </form>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar usuário por nome, login, perfil ou quadra…"
        count={{ shown: visibleUsers.length, total: allUsers.length }}
      />

      <div style={{ display: "grid", gap: 10 }}>
        {visibleUsers.length === 0 && <div style={{ color: "var(--muted)" }}>Nenhum usuário encontrado.</div>}
        {visibleUsers.map((u) => (
          <div
            key={u.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: 16,
              border: "1px solid var(--line)",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>
                {u.name} <span style={{ color: "var(--muted)" }}>@{u.username}</span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {ROLE_LABELS[u.role] || u.role}
                {u.venue_ids.length > 0 ? ` · quadras: ${u.venue_ids.map(venueName).join(", ")}` : ""}
                {!u.active ? " · inativo" : ""}
              </div>
            </div>
            {u.id !== user?.id && (
              <button
                type="button"
                style={{ ...btnStyle, background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)" }}
                onClick={() => remove.mutate(u.id)}
              >
                Remover
              </button>
            )}
          </div>
        ))}
      </div>
      <style>{`
        @media (max-width: 800px) {
          .user-form { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.25)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  padding: "10px 12px",
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 4px 4px 10px",
  border: "1px solid var(--accent)",
  background: "rgba(255,107,0,0.15)",
};

const chipRemoveStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: "0 6px",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  zIndex: 20,
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderTop: "none",
  maxHeight: 280,
  overflowY: "auto",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--line)",
  color: "var(--text)",
  padding: "10px 12px",
  cursor: "pointer",
};

const btnStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
  justifySelf: "start",
};
