import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { api } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";

export function CamerasPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras.list() });
  const [venueId, setVenueId] = useState("");
  const [name, setName] = useState("");
  const [rtsp, setRtsp] = useState("");
  const [buffer, setBuffer] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.cameras.create({
        venue_id: Number(venueId),
        name,
        rtsp_url: rtsp,
        buffer_seconds: buffer,
        start_stream: true,
      }),
    onSuccess: () => {
      setName("");
      setRtsp("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["cameras"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const start = useMutation({
    mutationFn: (id: number) => api.cameras.start(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cameras"] }),
  });
  const stop = useMutation({
    mutationFn: (id: number) => api.cameras.stop(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cameras"] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.cameras.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cameras"] }),
  });

  const venueName = (id: number) => venues.data?.find((v) => v.id === id)?.name || `#${id}`;
  const venueCity = (id: number) => venues.data?.find((v) => v.id === id)?.city || "";
  const [query, setQuery] = useState("");
  const allCams = cameras.data || [];
  const visibleCams = allCams.filter((c) =>
    matchesSearch(query, c.id, c.name, c.status, venueName(c.venue_id), venueCity(c.venue_id)),
  );

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>CÂMERAS</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          Cadastre streams RTSP e inicie o buffer contínuo.
        </p>
      </div>

      {isAdmin(user) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "1fr 1fr 2fr 100px auto",
            padding: 16,
            border: "1px solid var(--line)",
            background: "rgba(26,26,26,0.7)",
          }}
          className="cam-form"
        >
          <select
            required
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Quadra</option>
            {(venues.data || []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
          <input
            required
            placeholder="rtsp://..."
            value={rtsp}
            onChange={(e) => setRtsp(e.target.value)}
            style={inputStyle}
          />
          <input
            type="number"
            min={10}
            max={120}
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            style={inputStyle}
            title="Buffer segundos"
          />
          <button type="submit" style={btnStyle} disabled={create.isPending}>
            Adicionar
          </button>
        </form>
      )}
      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar câmera por nome, ID, quadra ou cidade…"
        count={{ shown: visibleCams.length, total: allCams.length }}
      />

      <div style={{ display: "grid", gap: 10 }}>
        {visibleCams.length === 0 && <div style={{ color: "var(--muted)" }}>Nenhuma câmera encontrada.</div>}
        {visibleCams.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              padding: 16,
              border: "1px solid var(--line)",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                <span style={{ color: "var(--accent)" }}>ID {c.id}</span> · {c.name}{" "}
                <span style={{ color: c.status === "streaming" ? "var(--accent-2)" : "var(--warn)" }}>
                  · {c.status}
                </span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13, wordBreak: "break-all" }}>
                {venueName(c.venue_id)} · buffer {c.buffer_seconds}s · {c.rtsp_url}
              </div>
            </div>
            {isAdmin(user) && (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={btnGhost} onClick={() => start.mutate(c.id)}>
                  Start
                </button>
                <button type="button" style={btnGhost} onClick={() => stop.mutate(c.id)}>
                  Stop
                </button>
                <button
                  type="button"
                  style={{ ...btnGhost, color: "var(--danger)", borderColor: "var(--danger)" }}
                  onClick={() => remove.mutate(c.id)}
                >
                  Remover
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <style>{`
        @media (max-width: 900px) {
          .cam-form { grid-template-columns: 1fr !important; }
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

const btnStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--line)",
  padding: "8px 12px",
  cursor: "pointer",
};
