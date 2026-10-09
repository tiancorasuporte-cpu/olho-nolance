import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CameraPreview } from "../components/CameraPreview";
import { api, type Camera, type Device } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";

export function VenueDetailPage({ venueId }: { venueId: number }) {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras.list() });
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices.list, enabled: admin });
  const [liveId, setLiveId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  const venue = venues.data?.find((v) => v.id === venueId);
  const venueCams = (cameras.data || []).filter((c) => c.venue_id === venueId);
  const camIds = new Set(venueCams.map((c) => c.id));
  const allDevices = devices.data || [];
  const devicesOf = (cameraId: number) => allDevices.filter((d) => d.camera_id === cameraId);
  const venueOnlyDevices = allDevices.filter((d) => d.camera_id == null && d.venue_id === venueId);
  const strayDevices = allDevices.filter(
    (d) => d.camera_id != null && d.venue_id === venueId && !camIds.has(d.camera_id),
  );

  if (venues.isLoading) return <div style={{ color: "var(--muted)" }}>Carregando…</div>;
  if (!venue) {
    return (
      <div className="fade-up" style={{ display: "grid", gap: 12 }}>
        <BackLink />
        <div style={{ color: "var(--muted)" }}>Quadra não encontrada.</div>
      </div>
    );
  }

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <BackLink />
        {editing ? (
          <VenueEditForm venue={venue} onDone={() => setEditing(false)} />
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <div>
              <h1 className="page-title">
                {venue.name}
              </h1>
              <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                {[venue.city, venue.description].filter(Boolean).join(" · ") || "Sem descrição"} · ID {venue.id}
              </p>
            </div>
            {admin && (
              <button type="button" style={btnGhost} onClick={() => setEditing(true)}>
                Editar quadra
              </button>
            )}
          </div>
        )}
      </div>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={sectionTitle}>Câmeras ({venueCams.length})</h2>
        {admin && <CameraCreateForm venueId={venueId} />}
        {venueCams.length === 0 && (
          <div style={{ color: "var(--muted)" }}>Nenhuma câmera nesta quadra ainda.</div>
        )}
        {venueCams.map((c) => (
          <CameraCard
            key={c.id}
            camera={c}
            devices={devicesOf(c.id)}
            admin={admin}
            live={liveId === c.id}
            onToggleLive={() => setLiveId((cur) => (cur === c.id ? null : c.id))}
          />
        ))}
      </section>

      {admin && (venueOnlyDevices.length > 0 || strayDevices.length > 0) && (
        <section style={{ display: "grid", gap: 12 }}>
          <h2 style={sectionTitle}>Botões da quadra (sem câmera definida)</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
            Botões antigos ligados só à quadra. Prefira criar botões dentro da câmera.
          </p>
          <DeviceList devices={[...venueOnlyDevices, ...strayDevices]} />
        </section>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/quadras" style={{ color: "var(--muted)", fontSize: 14 }}>
      ← Todas as quadras
    </Link>
  );
}

function VenueEditForm({
  venue,
  onDone,
}: {
  venue: { id: number; name: string; city: string | null; description: string | null };
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(venue.name);
  const [city, setCity] = useState(venue.city || "");
  const [description, setDescription] = useState(venue.description || "");
  const save = useMutation({
    mutationFn: () =>
      api.venues.update(venue.id, { name, city, description }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["venues"] });
      onDone();
    },
    onError: (e: Error) => window.alert(e.message),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) save.mutate();
      }}
      className="m-stack"
      style={{ ...formBox, gridTemplateColumns: "1fr 1fr 1fr auto auto" }}
    >
      <input required placeholder="Nome da quadra" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <input placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
      <input placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
      <button type="submit" style={btnStyle} disabled={save.isPending}>
        Salvar
      </button>
      <button type="button" style={btnGhost} onClick={onDone}>
        Cancelar
      </button>
    </form>
  );
}

function CameraCreateForm({ venueId }: { venueId: number }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [rtsp, setRtsp] = useState("");
  const [buffer, setBuffer] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api.cameras.create({ venue_id: venueId, name, rtsp_url: rtsp, buffer_seconds: buffer, start_stream: true }),
    onSuccess: () => {
      setName("");
      setRtsp("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["cameras"] });
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="m-stack"
        style={{ ...formBox, gridTemplateColumns: "1fr 2fr 100px auto" }}
      >
        <input required placeholder="Nome da câmera" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <input required placeholder="rtsp://..." value={rtsp} onChange={(e) => setRtsp(e.target.value)} style={inputStyle} />
        <input
          type="number"
          min={10}
          max={120}
          value={buffer}
          onChange={(e) => setBuffer(Number(e.target.value))}
          style={inputStyle}
          title="Buffer (segundos)"
        />
        <button type="submit" style={btnStyle} disabled={create.isPending}>
          Adicionar câmera
        </button>
      </form>
      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
    </>
  );
}

function CameraCard({
  camera,
  devices,
  admin,
  live,
  onToggleLive,
}: {
  camera: Camera;
  devices: Device[];
  admin: boolean;
  live: boolean;
  onToggleLive: () => void;
}) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["cameras"] });
  const onError = (e: Error) => window.alert(e.message);
  const start = useMutation({ mutationFn: () => api.cameras.start(camera.id), onSuccess: refresh, onError });
  const stop = useMutation({ mutationFn: () => api.cameras.stop(camera.id), onSuccess: refresh, onError });
  const remove = useMutation({ mutationFn: () => api.cameras.remove(camera.id), onSuccess: refresh, onError });
  const streaming = camera.status === "streaming";

  return (
    <div
      className="m-stack"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
        gap: 16,
        padding: 16,
        border: "1px solid var(--line)",
        background: "var(--card-2)", borderRadius: "var(--radius-sm)",
      }}
    >
      <CameraPreview camera={camera} live={live} onToggleLive={onToggleLive} />
      <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            <span style={{ color: "var(--accent)" }}>ID {camera.id}</span> · {camera.name}{" "}
            <span style={{ color: streaming ? "var(--accent-2)" : "var(--warn)" }}>· {camera.status}</span>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, wordBreak: "break-all" }}>
            buffer {camera.buffer_seconds}s · {camera.rtsp_url}
          </div>
        </div>
        {admin && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btnGhost} onClick={() => start.mutate()} disabled={start.isPending}>
              Iniciar
            </button>
            <button type="button" style={btnGhost} onClick={() => stop.mutate()} disabled={stop.isPending}>
              Parar
            </button>
            <button
              type="button"
              style={{ ...btnGhost, color: "var(--danger)", borderColor: "var(--danger)" }}
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Remover a câmera "${camera.name}"?`)) remove.mutate();
              }}
            >
              Remover
            </button>
          </div>
        )}
        {admin && (
          <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.04em" }}>
              BOTÕES ({devices.length})
            </div>
            <DeviceCreateForm venueId={camera.venue_id} cameraId={camera.id} />
            {devices.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Nenhum botão nesta câmera.</div>
            ) : (
              <DeviceList devices={devices} compact />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceCreateForm({ venueId, cameraId }: { venueId: number; cameraId: number }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.devices.create({ label, venue_id: venueId, camera_id: cameraId }),
    onSuccess: (d) => {
      setLabel("");
      setToken(d.token || null);
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (e: Error) => window.alert(e.message),
  });
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) create.mutate();
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          required
          placeholder="Nome do botão (ex: ESP32 gol norte)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 200px", minWidth: 0 }}
        />
        <button type="submit" style={btnStyle} disabled={create.isPending}>
          Gerar token
        </button>
      </form>
      {token && (
        <div style={{ padding: 12, border: "1px solid var(--accent)", background: "rgba(255,107,0,0.1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>Token gerado. Copie agora, ele não será mostrado de novo:</strong>
            <button type="button" style={{ ...btnGhost, padding: "4px 8px" }} onClick={() => setToken(null)}>
              ✕
            </button>
          </div>
          <pre style={{ margin: "8px 0 0", wordBreak: "break-all", whiteSpace: "pre-wrap" }}>{token}</pre>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>
            Envie <code>POST /api/clips/button</code> com o header <code>X-Device-Token</code>.
          </div>
        </div>
      )}
    </>
  );
}

export function DeviceList({ devices, compact = false }: { devices: Device[]; compact?: boolean }) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["devices"] });
  const onError = (e: Error) => window.alert(e.message);
  const revoke = useMutation({ mutationFn: (id: number) => api.devices.revoke(id), onSuccess: refresh, onError });
  const remove = useMutation({ mutationFn: (id: number) => api.devices.remove(id), onSuccess: refresh, onError });
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {devices.map((d) => (
        <div
          key={d.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            padding: compact ? "8px 10px" : 12,
            border: "1px solid var(--line)",
            background: "var(--card-2)", borderRadius: "var(--radius-sm)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{d.label}</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              token {d.token_prefix}… ·{" "}
              <span style={{ color: d.active ? "var(--accent-2)" : "var(--danger)" }}>
                {d.active ? "ativo" : "revogado"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {d.active && (
              <button
                type="button"
                style={{ ...btnGhost, padding: "6px 10px", color: "var(--warn)", borderColor: "var(--warn)" }}
                onClick={() => revoke.mutate(d.id)}
                disabled={revoke.isPending}
              >
                Revogar
              </button>
            )}
            <button
              type="button"
              style={{ ...btnGhost, padding: "6px 10px", color: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={() => {
                if (window.confirm(`Apagar o botão "${d.label}"? Esta ação não pode ser desfeita.`)) {
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
  );
}

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const formBox: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 16,
  border: "1px solid var(--line)",
  background: "var(--card)", borderRadius: "var(--radius)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--field)", borderRadius: "var(--radius-sm)",
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
