import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CameraPreview } from "../components/CameraPreview";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { StatCard } from "../components/StatCard";
import {
  cameraIdForHotkey,
  loadCameraHotkeys,
  type CameraHotkeys,
} from "../lib/cameraHotkeys";
import { api, clipStatusMessage, type Camera, type Venue } from "../lib/api";

export function LivePage() {
  const qc = useQueryClient();
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras.list() });
  const todayClips = useQuery({
    queryKey: ["clips", "today"],
    queryFn: () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return api.clips.list({ from: start.toISOString(), limit: 500 });
    },
    refetchInterval: 30_000,
  });
  const [venueId, setVenueId] = useState<number | "all">("all");
  const [focusId, setFocusId] = useState<number | null>(null);
  const [liveId, setLiveId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());
  const [hotkeys, setHotkeys] = useState<CameraHotkeys>(loadCameraHotkeys);
  const focusRef = useRef<number | null>(null);
  const pendingRef = useRef(pendingIds);
  const hotkeysRef = useRef(hotkeys);
  pendingRef.current = pendingIds;
  hotkeysRef.current = hotkeys;

  useEffect(() => {
    function refresh() {
      setHotkeys(loadCameraHotkeys());
    }
    window.addEventListener("focus", refresh);
    refresh();
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const list = cameras.data || [];
    const byVenue = venueId === "all" ? list : list.filter((c) => c.venue_id === venueId);
    return byVenue.filter((c) => {
      const v = venues.data?.find((x) => x.id === c.venue_id);
      return matchesSearch(query, c.id, c.name, v?.name, v?.city);
    });
  }, [cameras.data, venues.data, venueId, query]);

  const focused: Camera | null =
    filtered.find((c) => c.id === focusId) || filtered[0] || null;
  focusRef.current = focused?.id ?? null;

  useEffect(() => {
    if (focused && focusId !== focused.id) setFocusId(focused.id);
  }, [focused, focusId]);

  const venueName = (id: number) =>
    venues.data?.find((v: Venue) => v.id === id)?.name || `Quadra #${id}`;

  const trigger = useMutation({
    mutationFn: (id: number) => api.clips.create(id),
    onMutate: (id) => {
      setPendingIds((prev) => new Set(prev).add(id));
    },
    onSuccess: (clip, id) => {
      const cam = (cameras.data || []).find((c) => c.id === id);
      setMessage(
        `${cam ? `${venueName(cam.venue_id)} · ${cam.name}` : `Câmera #${id}`} — lance #${clip.id} ${clipStatusMessage(clip.status)}`,
      );
      void qc.invalidateQueries({ queryKey: ["clips"] });
    },
    onError: (err: Error) => setMessage(err.message),
    onSettled: (_d, _e, id) => {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  function fire(cameraId: number) {
    if (pendingRef.current.has(cameraId)) return;
    setFocusId(cameraId);
    trigger.mutate(cameraId);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      const mapped = cameraIdForHotkey(hotkeysRef.current, e);
      if (mapped == null) return;
      const exists = (cameras.data || []).some((c) => c.id === mapped);
      if (!exists) return;
      e.preventDefault();
      fire(mapped);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cameras.data]);

  const cols = filtered.length <= 1 ? "1fr" : "repeat(auto-fit, minmax(min(320px, 100%), 1fr))";

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Ao vivo</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
            Clique na imagem para ver ao vivo e em <strong>OLHO NO LANCE</strong> para gravar. Configure um
            botão USB por câmera em{" "}
            <Link to="/botao-pc" style={{ color: "var(--accent)", fontWeight: 700 }}>
              Botão PC
            </Link>
            .
          </p>
        </div>
        <Link
          to="/botao-pc"
          style={{
            alignSelf: "center",
            padding: "10px 16px",
            background: "var(--accent-soft)",
            borderRadius: "var(--radius-sm)",
            color: "var(--accent)",
            fontWeight: 600,
          }}
        >
          Teclas USB →
        </Link>
      </div>

      <div className="stat-grid">
        <StatCard icon="venue" label="Quadras" value={venues.data?.length ?? "—"} />
        <StatCard icon="camera" label="Câmeras" value={cameras.data?.length ?? "—"} />
        <StatCard
          icon="online"
          label="Câmeras online"
          value={cameras.data ? cameras.data.filter((c) => c.status === "streaming").length : "—"}
        />
        <StatCard icon="play" label="Lances hoje" value={todayClips.data?.length ?? "—"} accent />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={venueId}
          onChange={(e) => {
            const v = e.target.value === "all" ? "all" : Number(e.target.value);
            setVenueId(v);
            setFocusId(null);
          }}
          style={selectStyle}
          className="m-full"
        >
          <option value="all">Todas as quadras</option>
          {(venues.data || []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar câmera, quadra ou cidade…" />
        {message && (
          <div
            style={{
              padding: "10px 14px",
              border: "1px solid var(--line)",
              background: "var(--field)", borderRadius: "var(--radius-sm)",
              fontSize: 14,
              flex: 1,
              minWidth: 200,
            }}
          >
            {message}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: "var(--muted)", padding: 40, textAlign: "center", border: "1px dashed var(--line)" }}>
          Nenhuma câmera nesta seleção.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 16 }}>
          {filtered.map((cam) => {
            const busy = pendingIds.has(cam.id);
            const isFocus = focused?.id === cam.id;
            const key = hotkeys[String(cam.id)];
            return (
              <div
                key={cam.id}
                style={{
                  display: "grid",
                  border: isFocus ? "2px solid var(--accent)" : "1px solid var(--line)",
                  background: "var(--card)",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  opacity: busy ? 0.85 : 1,
                  animation: busy ? "pulse-glow 1.2s ease infinite" : undefined,
                }}
              >
                <CameraPreview
                  camera={cam}
                  live={liveId === cam.id}
                  onToggleLive={() => {
                    setFocusId(cam.id);
                    setLiveId((cur) => (cur === cam.id ? null : cam.id));
                  }}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fire(cam.id)}
                  onFocus={() => setFocusId(cam.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      fire(cam.id);
                    }
                  }}
                  style={{
                    cursor: busy ? "wait" : "pointer",
                    outline: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    background: busy ? "var(--accent)" : "var(--card)",
                    color: busy ? "var(--bg)" : "var(--text)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="brand"
                      style={{ fontSize: 26, letterSpacing: "0.04em", lineHeight: 1 }}
                    >
                      {busy ? "SALVANDO…" : "OLHO NO LANCE"}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                      {venueName(cam.venue_id)} · {cam.name}
                      {key ? ` · USB ${key}` : ""} · {cam.buffer_seconds}s
                    </div>
                  </div>
                  <div
                    className="brand"
                    style={{ fontSize: 22, color: busy ? "var(--bg)" : "var(--accent)", flexShrink: 0 }}
                  >
                    ▶
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "var(--field)", borderRadius: "var(--radius-sm)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  padding: "10px 12px",
  minWidth: 200,
};
