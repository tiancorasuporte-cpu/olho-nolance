import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { api, type Clip, type Venue } from "../lib/api";
import { isPlayer, useAuth } from "../lib/auth";

export function HistoryPage() {
  const { user } = useAuth();
  const player = isPlayer(user);
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const retentionDays = settings.data?.clip_retention_days ?? 0;
  const [venueQuery, setVenueQuery] = useState("");
  const [venueId, setVenueId] = useState<number | null>(null);
  const [cameraId, setCameraId] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clipQuery, setClipQuery] = useState("");
  const [preview, setPreview] = useState<Clip | null>(null);

  const venueList = venues.data || [];
  const selectedVenue = venueList.find((v) => v.id === venueId) || null;
  const venueMatches = useMemo(
    () => venueList.filter((v) => matchesSearch(venueQuery, v.name, v.city, v.description)),
    [venueList, venueQuery],
  );

  const params = useMemo(
    () => ({
      venue_id: venueId ?? undefined,
      camera_id: cameraId || undefined,
      status: status || undefined,
      source: source || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    }),
    [venueId, cameraId, status, source, from, to],
  );

  const clips = useQuery({
    queryKey: ["clips", params],
    queryFn: () => api.clips.list(params),
    refetchInterval: 5000,
    enabled: !player || venueId != null,
  });

  const clipList = clips.data || [];
  const cameraOptions = useMemo(() => {
    const map = new Map<number, string>();
    clipList.forEach((c) => map.set(c.camera_id, c.camera_name || `Câmera #${c.camera_id}`));
    return [...map.entries()];
  }, [clipList]);

  const visibleClips = clipList.filter((c) =>
    matchesSearch(clipQuery, c.id, c.camera_name, c.venue_name, c.source, c.status),
  );

  function selectVenue(v: Venue | null) {
    setVenueId(v?.id ?? null);
    setCameraId("");
    setPreview(null);
  }

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>HISTÓRICO</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          {player
            ? "Encontre sua quadra pelo nome ou cidade, assista ao lance e baixe."
            : "Busque a quadra por nome ou cidade e filtre os lances."}
          {retentionDays > 0 && (
            <>
              {" "}
              <span style={{ color: "var(--accent-2)" }}>
                Os lances ficam disponíveis por {retentionDays} {retentionDays === 1 ? "dia" : "dias"}.
              </span>
            </>
          )}
        </p>
      </div>

      <section
        style={{
          display: "grid",
          gap: 12,
          padding: 16,
          border: "1px solid var(--line)",
          background: "rgba(26,26,26,0.7)",
        }}
      >
        <div style={{ fontWeight: 700 }}>1. Escolha a quadra</div>
        <SearchInput
          value={venueQuery}
          onChange={setVenueQuery}
          placeholder="Digite o nome da quadra ou a cidade…"
          count={{ shown: venueMatches.length, total: venueList.length }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {!player && (
            <VenueChip active={venueId == null} onClick={() => selectVenue(null)}>
              Todas as quadras
            </VenueChip>
          )}
          {venueMatches.slice(0, 30).map((v) => (
            <VenueChip key={v.id} active={venueId === v.id} onClick={() => selectVenue(v)}>
              {v.name}
              {v.city && <span style={{ opacity: 0.75, fontWeight: 400 }}> · {v.city}</span>}
            </VenueChip>
          ))}
          {venueMatches.length === 0 && (
            <span style={{ color: "var(--muted)" }}>Nenhuma quadra encontrada.</span>
          )}
          {venueMatches.length > 30 && (
            <span style={{ color: "var(--muted)", alignSelf: "center" }}>
              +{venueMatches.length - 30} quadras — refine a busca
            </span>
          )}
        </div>
      </section>

      {player && venueId == null ? (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--muted)",
            border: "1px dashed var(--line)",
          }}
        >
          Selecione sua quadra acima para ver os lances.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <SearchInput
              value={clipQuery}
              onChange={setClipQuery}
              placeholder="Buscar lance (nº, câmera…)"
              count={{ shown: visibleClips.length, total: clipList.length }}
            />
            <select value={cameraId} onChange={(e) => setCameraId(e.target.value)} style={selectStyle}>
              <option value="">Todas câmeras</option>
              {cameraOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            {!player && (
              <>
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
                  <option value="">Status</option>
                  <option value="ready">pronto</option>
                  <option value="processing">processando</option>
                  <option value="failed">falhou</option>
                </select>
                <select value={source} onChange={(e) => setSource(e.target.value)} style={selectStyle}>
                  <option value="">Origem</option>
                  <option value="web">web</option>
                  <option value="button">botão</option>
                  <option value="api">api</option>
                </select>
              </>
            )}
            <label style={labelStyle}>
              De
              <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} style={selectStyle} />
            </label>
            <label style={labelStyle}>
              Até
              <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} style={selectStyle} />
            </label>
          </div>

          {preview && (
            <PreviewPanel
              clip={preview}
              venueLabel={selectedVenue?.name || preview.venue_name || `Quadra #${preview.venue_id}`}
              onClose={() => setPreview(null)}
            />
          )}

          <div style={{ overflowX: "auto", border: "1px solid var(--line)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.25)", textAlign: "left" }}>
                  {["Lance", "Quando", "Quadra", "Câmera", ...(player ? [] : ["Origem", "Status"]), "Ações"].map(
                    (h) => (
                      <th key={h} style={{ padding: "12px 14px", color: "var(--muted)", fontWeight: 600 }}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleClips.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderTop: "1px solid var(--line)",
                      background: preview?.id === c.id ? "rgba(255,107,0,0.08)" : undefined,
                    }}
                  >
                    <td style={cell}>#{c.id}</td>
                    <td style={cell}>{new Date(c.created_at).toLocaleString()}</td>
                    <td style={cell}>{c.venue_name || `#${c.venue_id}`}</td>
                    <td style={cell}>{c.camera_name || `#${c.camera_id}`}</td>
                    {!player && (
                      <>
                        <td style={cell}>{c.source}</td>
                        <td style={cell}>
                          <StatusBadge status={c.status} />
                          {c.error_message && (
                            <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>
                              {c.error_message}
                            </div>
                          )}
                        </td>
                      </>
                    )}
                    <td style={cell}>
                      {c.status === "ready" ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" style={ghostBtn} onClick={() => setPreview(c)}>
                            ▶ Assistir
                          </button>
                          <button type="button" style={primaryBtn} onClick={() => downloadClip(c.id)}>
                            Baixar
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {visibleClips.length === 0 && (
                  <tr>
                    <td colSpan={player ? 5 : 7} style={{ padding: 24, color: "var(--muted)" }}>
                      {clips.isLoading ? "Carregando…" : "Nenhum lance encontrado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PreviewPanel({ clip, venueLabel, onClose }: { clip: Clip; venueLabel: string; onClose: () => void }) {
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [clip.id]);

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 12,
        border: "1px solid var(--accent)",
        background: "rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <strong>Lance #{clip.id}</strong>{" "}
          <span style={{ color: "var(--muted)" }}>
            · {venueLabel} · {clip.camera_name || `Câmera #${clip.camera_id}`} ·{" "}
            {new Date(clip.created_at).toLocaleString()}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={primaryBtn} onClick={() => downloadClip(clip.id)}>
            Baixar
          </button>
          <button type="button" style={ghostBtn} onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
      {error ? (
        <div style={{ padding: 24, color: "var(--danger)", textAlign: "center" }}>
          Não foi possível carregar o vídeo.
        </div>
      ) : (
        <video
          key={clip.id}
          src={api.clips.videoUrl(clip.id)}
          controls
          autoPlay
          playsInline
          onError={() => setError(true)}
          style={{ width: "100%", maxHeight: "70vh", background: "#000", display: "block" }}
        />
      )}
    </div>
  );
}

function downloadClip(id: number) {
  const token = localStorage.getItem("token");
  void fetch(api.clips.downloadUrl(id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lance-${id}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch((err: Error) => window.alert(`Falha ao baixar: ${err.message}`));
}

function VenueChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 12px",
        border: active ? "1px solid var(--accent)" : "1px solid var(--line)",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--bg)" : "var(--text)",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "ready" ? "var(--accent-2)" : status === "failed" ? "var(--danger)" : "var(--warn)";
  const label = status === "ready" ? "pronto" : status === "failed" ? "falhou" : "processando";
  return <span style={{ color, fontWeight: 600 }}>{label}</span>;
}

const cell: React.CSSProperties = { padding: "12px 14px" };

const selectStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.25)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  padding: "10px 12px",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "var(--muted)",
  fontSize: 13,
};

const primaryBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  padding: "6px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--accent)",
  border: "1px solid var(--accent)",
  padding: "6px 12px",
  fontWeight: 600,
  cursor: "pointer",
};
