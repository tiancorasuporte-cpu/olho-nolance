import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { api, ROLE_LABELS, type Role, type User, type Venue } from "../lib/api";
import { isAdmin, isGlobalAdmin, useAuth } from "../lib/auth";

const VENUE_ROLES: Role[] = ["admin", "operator"];

export function UsersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const global = isGlobalAdmin(user);
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list, enabled: isAdmin(user) });
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const venueList = venues.data || [];
  const venueName = (id: number) => venueList.find((v) => v.id === id)?.name || `Quadra #${id}`;
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const allUsers = users.data || [];
  const visibleUsers = allUsers.filter((u) =>
    matchesSearch(query, u.name, u.username, u.role, ROLE_LABELS[u.role], ...u.venue_ids.map(venueName)),
  );

  const roleOptions: Role[] = global
    ? ["player", "operator", "admin", ...(user?.role === "superadmin" ? (["superadmin"] as Role[]) : [])]
    : ["operator", "admin"];

  const emptyForm = { username: "", password: "", name: "", role: "operator" as Role, venue_ids: [] as number[] };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.users.create(form),
    onSuccess: () => {
      setForm(emptyForm);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.users.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["users"] }),
    onError: (e: Error) => window.alert(e.message),
  });

  if (!isAdmin(user)) {
    return <div style={{ color: "var(--muted)" }}>Acesso restrito a admins.</div>;
  }

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>USUÁRIOS</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          <b>Admin</b> vinculado a quadras gerencia só essas quadras: câmeras, botões, propagandas, lances e a
          equipe delas. {global && "Admin sem quadra é admin geral. "}
          <b>Operador</b> aciona e assiste os lances das quadras dele.
          {global && " Participante só acessa os Lances: busca a quadra, assiste e baixa."}
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
            placeholder="Usuário (login)"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            style={inputStyle}
            autoComplete="off"
          />
          <input
            required
            type="password"
            placeholder="Senha"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={inputStyle}
            autoComplete="new-password"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            style={inputStyle}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        {VENUE_ROLES.includes(form.role) && (
          <VenuePicker
            venues={venueList}
            value={form.venue_ids}
            onChange={(venue_ids) => setForm({ ...form, venue_ids })}
            hint={venueHint(form.role, global)}
          />
        )}
        {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
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
              display: "grid",
              gap: 12,
              padding: 16,
              border: editingId === u.id ? "1px solid var(--accent)" : "1px solid var(--line)",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  {u.name} <span style={{ color: "var(--muted)" }}>@{u.username}</span>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {ROLE_LABELS[u.role] || u.role}
                  {u.role === "admin" && u.venue_ids.length === 0 && " geral"}
                  {u.venue_ids.length > 0 && ` · quadras: ${u.venue_ids.map(venueName).join(", ")}`}
                  {!u.active && <span style={{ color: "var(--danger)" }}> · inativo</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={ghostBtn}
                  onClick={() => setEditingId(editingId === u.id ? null : u.id)}
                >
                  {editingId === u.id ? "Fechar" : "Editar"}
                </button>
                {u.id !== user?.id && (
                  <button
                    type="button"
                    style={{ ...ghostBtn, color: "var(--danger)", borderColor: "var(--danger)" }}
                    onClick={() => {
                      if (window.confirm(`Remover o usuário "${u.name}"?`)) remove.mutate(u.id);
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
            {editingId === u.id && (
              <UserEditor
                target={u}
                self={u.id === user?.id}
                roleOptions={roleOptions}
                global={global}
                venues={venueList}
                onDone={() => setEditingId(null)}
              />
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

function venueHint(role: Role, global: boolean): string {
  if (role === "operator") return "O operador aciona e assiste os lances destas quadras.";
  return global
    ? "O admin gerencia só estas quadras. Deixe sem quadra para ser admin geral (gerencia tudo)."
    : "O admin gerencia só estas quadras.";
}

function UserEditor({
  target,
  self,
  roleOptions,
  global,
  venues,
  onDone,
}: {
  target: User;
  self: boolean;
  roleOptions: Role[];
  global: boolean;
  venues: Venue[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(target.name);
  const [role, setRole] = useState<Role>(target.role);
  const [venueIds, setVenueIds] = useState<number[]>(target.venue_ids);
  const [active, setActive] = useState(target.active);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.users.update(target.id, {
        name,
        ...(self ? {} : { role, venue_ids: VENUE_ROLES.includes(role) ? venueIds : [], active }),
        ...(password ? { password } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  const options = roleOptions.includes(target.role) ? roleOptions : [target.role, ...roleOptions];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      style={{ display: "grid", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }} className="user-form">
        <input required placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          style={inputStyle}
          disabled={self}
          title={self ? "Você não pode alterar o próprio perfil" : undefined}
        >
          {options.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <input
          type="password"
          placeholder="Nova senha (deixe vazio para manter)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          autoComplete="new-password"
        />
      </div>
      {!self && VENUE_ROLES.includes(role) && (
        <VenuePicker venues={venues} value={venueIds} onChange={setVenueIds} hint={venueHint(role, global)} />
      )}
      {!self && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--muted)", fontSize: 14 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Usuário ativo
        </label>
      )}
      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={btnStyle} disabled={save.isPending}>
          Salvar
        </button>
        <button type="button" style={ghostBtn} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function VenuePicker({
  venues,
  value,
  onChange,
  hint,
}: {
  venues: Venue[];
  value: number[];
  onChange: (ids: number[]) => void;
  hint: string;
}) {
  const [query, setQuery] = useState("");
  const venueName = (id: number) => venues.find((v) => v.id === id)?.name || `Quadra #${id}`;
  const results = query.trim()
    ? venues
        .filter((v) => !value.includes(v.id) && matchesSearch(query, v.name, v.city, v.description, String(v.id)))
        .slice(0, 8)
    : [];
  const add = (id: number) => {
    onChange([...value, id]);
    setQuery("");
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>{hint}</div>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {value.map((id) => (
            <span key={id} style={chipStyle}>
              {venueName(id)}
              <button
                type="button"
                aria-label="Remover quadra"
                onClick={() => onChange(value.filter((x) => x !== id))}
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (results[0]) add(results[0].id);
            }
          }}
          placeholder="Digite o nome, cidade ou ID da quadra para vincular…"
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
        />
        {query.trim() && (
          <div style={dropdownStyle}>
            {results.length === 0 && (
              <div style={{ padding: "10px 12px", color: "var(--muted)" }}>Nenhuma quadra encontrada.</div>
            )}
            {results.map((v) => (
              <button key={v.id} type="button" onClick={() => add(v.id)} style={dropdownItemStyle}>
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

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--line)",
  padding: "8px 12px",
  cursor: "pointer",
};
