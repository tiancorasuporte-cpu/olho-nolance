import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { DeviceList } from "./VenueDetailPage";
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
    onError: (e: Error) => window.alert(e.message),
  });

  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras.list() });
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices.list, enabled: isAdmin(user) });
  const allCams = cameras.data || [];
  const allDevices = devices.data || [];
  const camsOf = (venueId: number) => allCams.filter((c) => c.venue_id === venueId);
  const buttonsOf = (venueId: number) => {
    const ids = new Set(camsOf(venueId).map((c) => c.id));
    return allDevices.filter((d) => (d.camera_id != null ? ids.has(d.camera_id) : d.venue_id === venueId));
  };
  const unassigned = allDevices.filter((d) => d.camera_id == null && d.venue_id == null);

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>QUADRAS</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          Cadastre a quadra e abra-a para gerenciar as câmeras e os botões de cada câmera.
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
        {visible.map((v) => {
          const cams = camsOf(v.id);
          const online = cams.filter((c) => c.status === "streaming").length;
          const buttons = buttonsOf(v.id).length;
          return (
            <Link
              key={v.id}
              to="/quadras/$venueId"
              params={{ venueId: String(v.id) }}
              className="venue-card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                padding: 16,
                border: "1px solid var(--line)",
                background: "rgba(0,0,0,0.2)",
                color: "inherit",
                textDecoration: "none",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {v.name}
                  {v.city && <span style={{ color: "var(--accent)", fontWeight: 600 }}> · {v.city}</span>}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>
                  {cams.length} {cams.length === 1 ? "câmera" : "câmeras"}
                  {cams.length > 0 && (
                    <span style={{ color: online === cams.length ? "var(--accent-2)" : "var(--warn)" }}>
                      {" "}
                      ({online} online)
                    </span>
                  )}
                  {isAdmin(user) && ` · ${buttons} ${buttons === 1 ? "botão" : "botões"}`}
                  {v.description && ` · ${v.description}`}
                  {!v.active && " · inativa"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isAdmin(user) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (cams.length > 0) {
                        window.alert("Remova as câmeras desta quadra antes de apagá-la.");
                        return;
                      }
                      if (window.confirm(`Remover a quadra "${v.name}"?`)) remove.mutate(v.id);
                    }}
                    style={{ ...btnStyle, background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)" }}
                  >
                    Remover
                  </button>
                )}
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>Abrir →</span>
              </div>
            </Link>
          );
        })}
      </div>

      {isAdmin(user) && unassigned.length > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 20, textTransform: "uppercase" }}>Botões sem quadra</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
            Botões que não estão ligados a nenhuma quadra nem câmera.
          </p>
          <DeviceList devices={unassigned} />
        </section>
      )}
      <style>{`.venue-card:hover { border-color: var(--accent) !important; }`}</style>
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
