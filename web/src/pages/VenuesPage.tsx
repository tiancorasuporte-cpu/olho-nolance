import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { api } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";

export function VenuesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");

  const all = venues.data || [];
  const visible = all.filter((v) => matchesSearch(query, v.id, v.name, v.city, v.description));

  const create = useMutation({
    mutationFn: () =>
      api.venues.create({ name, city: city || undefined, description: description || undefined }),
    onSuccess: () => {
      setName("");
      setCity("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: ["venues"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.venues.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["venues"] }),
  });

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>QUADRAS</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          Cadastre campos e quadras esportivas.
        </p>
      </div>

      {isAdmin(user) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "1fr 1fr 1fr auto",
            padding: 16,
            border: "1px solid var(--line)",
            background: "rgba(26,26,26,0.7)",
          }}
          className="m-stack"
        >
          <input
            placeholder="Nome da quadra"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            placeholder="Cidade"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inputStyle}
          />
          <button type="submit" style={btnStyle} disabled={create.isPending}>
            Adicionar
          </button>
        </form>
      )}

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar quadra por nome ou cidade…"
        count={{ shown: visible.length, total: all.length }}
      />

      <div style={{ display: "grid", gap: 10 }}>
        {visible.length === 0 && <div style={{ color: "var(--muted)" }}>Nenhuma quadra encontrada.</div>}
        {visible.map((v) => (
          <div
            key={v.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: 16,
              border: "1px solid var(--line)",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                {v.name}
                {v.city && <span style={{ color: "var(--accent)", fontWeight: 600 }}> · {v.city}</span>}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>
                ID {v.id} · {v.description || "Sem descrição"} · {v.active ? "ativa" : "inativa"}
              </div>
            </div>
            {isAdmin(user) && (
              <button
                type="button"
                onClick={() => remove.mutate(v.id)}
                style={{ ...btnStyle, background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)" }}
              >
                Remover
              </button>
            )}
          </div>
        ))}
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

const btnStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
};
