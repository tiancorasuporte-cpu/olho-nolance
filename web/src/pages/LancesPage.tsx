import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { api, type Clip } from "../lib/api";
import { isPlayer, useAuth } from "../lib/auth";

function RetentionNotice() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const days = settings.data?.clip_retention_days ?? 0;
  if (days <= 0) return null;
  return (
    <span style={{ color: "var(--accent-2)" }}>
      {" "}
      Os lances ficam disponíveis por {days} {days === 1 ? "dia" : "dias"}.
    </span>
  );
}

export function LancesPage() {
  const { user } = useAuth();
  const player = isPlayer(user);
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras.list(), enabled: !player });
  const [query, setQuery] = useState("");
  const all = venues.data || [];
  const matches = all.filter((v) => matchesSearch(query, v.id, v.name, v.city, v.description));
  const shown = matches.slice(0, 60);
  const camCount = (venueId: number) => (cameras.data || []).filter((c) => c.venue_id === venueId).length;

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 className="page-title">Lances</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          {player
            ? "Encontre sua quadra pelo nome ou cidade e abra para assistir e baixar os lances."
            : "Escolha a quadra para ver os lances dela."}
          <RetentionNotice />
        </p>
      </div>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Digite o nome da quadra ou a cidade…"
        count={{ shown: matches.length, total: all.length }}
      />

      <div style={{ display: "grid", gap: 10 }}>
        {!player && !query && (
          <Link to="/lances/$venueId" params={{ venueId: "todas" }} className="venue-card" style={cardLink}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Todas as quadras</div>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>Últimos lances de todas as quadras</div>
            </div>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>Abrir →</span>
          </Link>
        )}
        {venues.isLoading && <div style={{ color: "var(--muted)" }}>Carregando…</div>}
        {!venues.isLoading && matches.length === 0 && (
          <div style={{ color: "var(--muted)" }}>Nenhuma quadra encontrada.</div>
        )}
        {shown.map((v) => (
          <Link
            key={v.id}
            to="/lances/$venueId"
            params={{ venueId: String(v.id) }}
            className="venue-card"
            style={cardLink}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                {v.name}
                {v.city && <span style={{ color: "var(--accent)", fontWeight: 600 }}> · {v.city}</span>}
              </div>
              {!player && (
                <div style={{ color: "var(--muted)", fontSize: 14 }}>
                  {camCount(v.id)} {camCount(v.id) === 1 ? "câmera" : "câmeras"}
                </div>
              )}
            </div>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>Ver lances →</span>
          </Link>
        ))}
        {matches.length > shown.length && (
          <div style={{ color: "var(--muted)" }}>+{matches.length - shown.length} quadras. Refine a busca.</div>
        )}
      </div>
      <style>{`.venue-card:hover { border-color: var(--accent) !important; }`}</style>
    </div>
  );
}

export function LancesVenuePage({ venueId }: { venueId: number | null }) {
  const { user } = useAuth();
  const player = isPlayer(user);
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const [cameraId, setCameraId] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clipQuery, setClipQuery] = useState("");
  const [preview, setPreview] = useState<Clip | null>(null);

  const selectedVenue = venues.data?.find((v) => v.id === venueId) || null;

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

  const title =
    venueId == null ? "Todas as quadras" : selectedVenue?.name || (venues.isLoading ? "…" : `Quadra #${venueId}`);

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <Link to="/lances" style={{ color: "var(--muted)", fontSize: 14 }}>
          ← Lances · todas as quadras
        </Link>
        <h1 className="page-title">{title}</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          {selectedVenue?.city ? `${selectedVenue.city} · ` : ""}
          Assista, baixe e compartilhe os lances.
          <RetentionNotice />
        </p>
      </div>

      {player && venueId == null ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)" }}>
          <Link to="/lances" style={{ color: "var(--accent)" }}>
            Escolha sua quadra
          </Link>{" "}
          para ver os lances.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <div className="m-full" style={{ flex: "1 1 260px", maxWidth: 480 }}>
              <SearchInput
                value={clipQuery}
                onChange={setClipQuery}
                placeholder="Buscar lance (nº, câmera…)"
                count={{ shown: visibleClips.length, total: clipList.length }}
              />
            </div>
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              style={selectStyle}
              className="m-full"
            >
              <option value="">Todas câmeras</option>
              {cameraOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            {!player && (
              <>
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle} className="m-full">
                  <option value="">Status</option>
                  <option value="ready">pronto</option>
                  <option value="processing">processando</option>
                  <option value="failed">falhou</option>
                </select>
                <select value={source} onChange={(e) => setSource(e.target.value)} style={selectStyle} className="m-full">
                  <option value="">Origem</option>
                  <option value="web">web</option>
                  <option value="button">botão</option>
                  <option value="api">api</option>
                </select>
              </>
            )}
            <label style={labelStyle} className="m-full">
              <span style={{ width: 28 }}>De</span>
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                style={{ ...selectStyle, flex: 1, minWidth: 0 }}
              />
            </label>
            <label style={labelStyle} className="m-full">
              <span style={{ width: 28 }}>Até</span>
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={{ ...selectStyle, flex: 1, minWidth: 0 }}
              />
            </label>
          </div>

          {preview && (
            <PreviewPanel
              clip={preview}
              venueLabel={selectedVenue?.name || preview.venue_name || `Quadra #${preview.venue_id}`}
              onClose={() => setPreview(null)}
            />
          )}

          <div className="only-mobile">
            <div style={{ display: "grid", gap: 10 }}>
              {visibleClips.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 14,
                    border: preview?.id === c.id ? "1px solid var(--accent)" : "1px solid var(--line)",
                    background: "var(--card-2)", borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>
                        Lance #{c.id} · {c.camera_name || `Câmera #${c.camera_id}`}
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                        {c.venue_name || `Quadra #${c.venue_id}`} · {new Date(c.created_at).toLocaleString()}
                      </div>
                    </div>
                    {!player && <StatusBadge status={c.status} />}
                  </div>
                  {!player && c.error_message && (
                    <div style={{ color: "var(--danger)", fontSize: 12 }}>{c.error_message}</div>
                  )}
                  {c.status === "ready" ? (
                    <ClipActions clip={c} onPreview={() => setPreview(c)} />
                  ) : (
                    c.status === "processing" && (
                      <div style={{ color: "var(--warn)", fontSize: 13 }}>Gerando o vídeo…</div>
                    )
                  )}
                </div>
              ))}
              {visibleClips.length === 0 && (
                <div style={{ padding: 24, color: "var(--muted)", textAlign: "center", border: "1px dashed var(--line)" }}>
                  {clips.isLoading ? "Carregando…" : "Nenhum lance encontrado."}
                </div>
              )}
            </div>
          </div>

          <div
            className="only-desktop"
            style={{
              overflowX: "auto",
              border: "1px solid var(--line)",
              background: "var(--card)",
              borderRadius: "var(--radius)",
              padding: "8px 16px",
            }}
          >
            <table className="clip-table" style={{ width: "100%", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
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
                  <tr key={c.id} data-active={preview?.id === c.id}>
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
                        <ClipActions clip={c} onPreview={() => setPreview(c)} />
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

function ClipActions({ clip, onPreview }: { clip: Clip; onPreview: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" style={ghostBtn} onClick={onPreview}>
        ▶ Assistir
      </button>
      <button type="button" style={primaryBtn} onClick={() => downloadClip(clip.id)}>
        Baixar
      </button>
      {canShareFiles() && (
        <button type="button" style={ghostBtn} onClick={() => shareClip(clip.id)}>
          Compartilhar
        </button>
      )}
    </div>
  );
}

function PreviewPanel({ clip, venueLabel, onClose }: { clip: Clip; venueLabel: string; onClose: () => void }) {
  const [error, setError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setError(false);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [clip.id]);

  return (
    <div
      ref={panelRef}
      style={{
        scrollMarginTop: 80,
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={primaryBtn} onClick={() => downloadClip(clip.id)}>
            Baixar
          </button>
          {canShareFiles() && (
            <button type="button" style={ghostBtn} onClick={() => shareClip(clip.id)}>
              Compartilhar
            </button>
          )}
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

function fetchClipBlob(id: number): Promise<Blob> {
  const token = localStorage.getItem("token");
  return fetch(api.clips.downloadUrl(id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.blob();
  });
}

/** Web Share with files: only on HTTPS and supporting phones (Android Chrome, iOS Safari). */
function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([], "lance.mp4", { type: "video/mp4" })] });
  } catch {
    return false;
  }
}

function shareClip(id: number) {
  void fetchClipBlob(id)
    .then((blob) =>
      navigator.share({
        files: [new File([blob], `lance-${id}.mp4`, { type: "video/mp4" })],
        title: `ONL Sports · Lance #${id}`,
      }),
    )
    .catch((err: Error) => {
      if (err.name !== "AbortError") window.alert(`Falha ao compartilhar: ${err.message}`);
    });
}

function downloadClip(id: number) {
  void fetchClipBlob(id)
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

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "ready" ? "var(--accent-2)" : status === "failed" ? "var(--danger)" : "var(--warn)";
  const label = status === "ready" ? "pronto" : status === "failed" ? "falhou" : "processando";
  return <span style={{ color, fontWeight: 600 }}>{label}</span>;
}

const cell: React.CSSProperties = { padding: "12px 14px" };

const cardLink: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 12,
  padding: 16,
  border: "1px solid var(--line)",
  background: "var(--card-2)", borderRadius: "var(--radius-sm)",
  color: "inherit",
  textDecoration: "none",
};

const selectStyle: React.CSSProperties = {
  background: "var(--field)", borderRadius: "var(--radius-sm)",
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
  padding: "9px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--accent)",
  border: "1px solid var(--accent)",
  padding: "9px 14px",
  fontWeight: 600,
  cursor: "pointer",
};
