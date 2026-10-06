import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { api } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";

export function DevicesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: api.devices.list,
    enabled: isAdmin(user),
  });
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras.list() });
  const [label, setLabel] = useState("");
  const [venueId, setVenueId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const venueName = (id: number | null) =>
    id == null ? null : venues.data?.find((v) => v.id === id)?.name || `Quadra #${id}`;
  const venueCity = (id: number | null) =>
    id == null ? null : venues.data?.find((v) => v.id === id)?.city || null;
  const cameraName = (id: number | null) =>
    id == null ? null : cameras.data?.find((c) => c.id === id)?.name || `Câmera #${id}`;
  const allDevices = devices.data || [];
  const visibleDevices = allDevices.filter((d) =>
    matchesSearch(
      query,
      d.id,
      d.label,
      d.token_prefix,
      venueName(d.venue_id),
      venueCity(d.venue_id),
      cameraName(d.camera_id),
      d.camera_id != null ? `camera ${d.camera_id}` : null,
      d.active ? "ativo" : "revogado",
    ),
  );

  const create = useMutation({
    mutationFn: () =>
      api.devices.create({
        label,
        venue_id: venueId ? Number(venueId) : undefined,
        camera_id: cameraId ? Number(cameraId) : undefined,
      }),
    onSuccess: (d) => {
      setLabel("");
      setNewToken(d.token || null);
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: number) => api.devices.revoke(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["devices"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.devices.remove(id),
    onSuccess: () => {
      setNewToken(null);
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  if (!isAdmin(user)) {
    return <div style={{ color: "var(--muted)" }}>Acesso restrito a admins.</div>;
  }

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>DEVICES</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          Tokens para botão físico:{" "}
          <code style={{ color: "var(--accent-2)" }}>POST /clips/button</code> com header{" "}
          <code style={{ color: "var(--accent-2)" }}>X-Device-Token</code>.
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
          gridTemplateColumns: "2fr 1fr 1fr auto",
          padding: 16,
          border: "1px solid var(--line)",
          background: "rgba(26,26,26,0.7)",
        }}
        className="dev-form"
      >
        <input
          required
          placeholder="Label (ex: Botão Quadra 1)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={inputStyle}
        />
        <select value={venueId} onChange={(e) => setVenueId(e.target.value)} style={inputStyle}>
          <option value="">Quadra (opcional)</option>
          {(venues.data || []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select value={cameraId} onChange={(e) => setCameraId(e.target.value)} style={inputStyle}>
          <option value="">Câmera (opcional)</option>
          {(cameras.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" style={btnStyle} disabled={create.isPending}>
          Gerar token
        </button>
      </form>

      {newToken && (
        <div
          style={{
            padding: 16,
            border: "1px solid var(--accent)",
            background: "rgba(255,107,0,0.1)",
          }}
        >
          <strong>Token gerado (copie agora — não será mostrado de novo):</strong>
          <pre style={{ margin: "8px 0 0", wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
            {newToken}
          </pre>
        </div>
      )}

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar botão por nome, quadra, cidade, câmera ou prefixo do token…"
        count={{ shown: visibleDevices.length, total: allDevices.length }}
      />

      <div style={{ display: "grid", gap: 10 }}>
        {visibleDevices.length === 0 && <div style={{ color: "var(--muted)" }}>Nenhum botão encontrado.</div>}
        {visibleDevices.map((d) => (
          <div
            key={d.id}
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
              <div style={{ fontWeight: 700 }}>{d.label}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                token {d.token_prefix}… · quadra {venueName(d.venue_id) ?? "qualquer"} · câmera{" "}
                {d.camera_id != null ? `${cameraName(d.camera_id)} (ID ${d.camera_id})` : "qualquer"} ·{" "}
                <span style={{ color: d.active ? "var(--accent-2)" : "var(--danger)" }}>
                  {d.active ? "ativo" : "revogado"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {d.active && (
                <button
                  type="button"
                  style={{
                    ...btnStyle,
                    background: "transparent",
                    color: "var(--warn)",
                    border: "1px solid var(--warn)",
                  }}
                  onClick={() => revoke.mutate(d.id)}
                  disabled={revoke.isPending}
                >
                  Revogar
                </button>
              )}
              <button
                type="button"
                style={{
                  ...btnStyle,
                  background: "transparent",
                  color: "var(--danger)",
                  border: "1px solid var(--danger)",
                }}
                onClick={() => {
                  if (window.confirm(`Apagar o token "${d.label}"? Esta ação não pode ser desfeita.`)) {
                    remove.mutate(d.id);
                  }
                }}
                disabled={remove.isPending}
              >
                Apagar
              </button>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @media (max-width: 800px) {
          .dev-form { grid-template-columns: 1fr !important; }
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
