import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { LivePlayer } from "../components/LivePlayer";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import {
  cameraIdForHotkey,
  keyLabelFromEvent,
  loadCameraHotkeys,
  saveCameraHotkeys,
  type CameraHotkeys,
} from "../lib/cameraHotkeys";
import { api, clipStatusMessage, liveUrl, type Venue } from "../lib/api";

export function PcButtonPage() {
  const qc = useQueryClient();
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras.list() });
  const [venueId, setVenueId] = useState<number | "all">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [hotkeys, setHotkeys] = useState<CameraHotkeys>(loadCameraHotkeys);
  const [listeningId, setListeningId] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());
  const pendingRef = useRef(pendingIds);
  const hotkeysRef = useRef(hotkeys);
  const listeningRef = useRef(listeningId);
  pendingRef.current = pendingIds;
  hotkeysRef.current = hotkeys;
  listeningRef.current = listeningId;

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const list = cameras.data || [];
    const byVenue = venueId === "all" ? list : list.filter((c) => c.venue_id === venueId);
    return byVenue.filter((c) => {
      const v = venues.data?.find((x) => x.id === c.venue_id);
      return matchesSearch(query, c.id, c.name, v?.name, v?.city, hotkeys[String(c.id)]);
    });
  }, [cameras.data, venues.data, venueId, query, hotkeys]);

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
    trigger.mutate(cameraId);
  }

  function assignKey(cameraId: number, label: string) {
    setHotkeys((prev) => {
      const next: CameraHotkeys = { ...prev };
      // Remove same key from other cameras
      for (const [id, key] of Object.entries(next)) {
        if (key === label && Number(id) !== cameraId) delete next[id];
      }
      next[String(cameraId)] = label;
      saveCameraHotkeys(next);
      return next;
    });
    const cam = (cameras.data || []).find((c) => c.id === cameraId);
    setMessage(
      `Botão USB "${label}" → ${cam ? `${venueName(cam.venue_id)} · ${cam.name}` : `câmera #${cameraId}`}`,
    );
    setListeningId(null);
  }

  function clearKey(cameraId: number) {
    setHotkeys((prev) => {
      const next = { ...prev };
      delete next[String(cameraId)];
      saveCameraHotkeys(next);
      return next;
    });
    setMessage("Tecla removida desta câmera.");
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const listenId = listeningRef.current;
      if (listenId != null) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          setListeningId(null);
          setMessage("Cancelado.");
          return;
        }
        assignKey(listenId, keyLabelFromEvent(e));
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      const camId = cameraIdForHotkey(hotkeysRef.current, e);
      if (camId == null) return;

      // Only fire if camera exists (and ideally is in current filter / all cams)
      const exists = (cameras.data || []).some((c) => c.id === camId);
      if (!exists) return;

      e.preventDefault();
      fire(camId);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cameras.data]);

  const cols = filtered.length <= 1 ? "1fr" : "repeat(auto-fit, minmax(min(300px, 100%), 1fr))";

  return (
    <div className="fade-up" style={{ display: "grid", gap: 16, minHeight: "70vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>BOTÃO PC</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
            Em cada câmera, clique em <strong style={{ color: "var(--accent)" }}>Tecla USB</strong> e
            aperte o botão físico. Cada USB fica ligado a uma câmera.
          </p>
        </div>
        <Link to="/" style={{ color: "var(--muted)", alignSelf: "center" }}>
          ← Voltar ao vivo
        </Link>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={venueId}
          onChange={(e) => {
            const v = e.target.value === "all" ? "all" : Number(e.target.value);
            setVenueId(v);
          }}
          style={selectStyle}
        >
          <option value="all">Todas as quadras</option>
          {(venues.data || []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar câmera, quadra, cidade ou tecla…" />
        {listeningId != null && (
          <div
            style={{
              padding: "10px 14px",
              border: "1px solid var(--accent)",
              color: "var(--accent)",
              fontWeight: 700,
            }}
          >
            Aperte o botão USB agora… (Esc cancela)
          </div>
        )}
        {message && (
          <div
            style={{
              padding: "10px 14px",
              border: "1px solid var(--line)",
              background: "rgba(0,0,0,0.25)",
              fontSize: 14,
              flex: 1,
              minWidth: 180,
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
            const key = hotkeys[String(cam.id)];
            const listening = listeningId === cam.id;
            return (
              <div
                key={cam.id}
                style={{
                  display: "grid",
                  border: listening ? "2px solid var(--accent)" : "1px solid var(--line)",
                  background: "rgba(0,0,0,0.35)",
                  overflow: "hidden",
                  minHeight: 280,
                  boxShadow: listening ? "0 0 0 4px rgba(255,107,0,0.25)" : undefined,
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fire(cam.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      fire(cam.id);
                    }
                  }}
                  style={{
                    cursor: busy ? "wait" : "pointer",
                    opacity: busy ? 0.85 : 1,
                    animation: busy ? "pulse-glow 1.2s ease infinite" : undefined,
                    outline: "none",
                  }}
                >
                  <div style={{ pointerEvents: "none" }}>
                    <LivePlayer src={liveUrl(cam)} />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      padding: "16px",
                      background: busy ? "var(--accent)" : "rgba(20,20,20,0.95)",
                      color: busy ? "var(--bg)" : "var(--text)",
                    }}
                  >
                    <div>
                      <div className="brand" style={{ fontSize: 28, letterSpacing: "0.04em", lineHeight: 1 }}>
                        {busy ? "SALVANDO…" : "OLHO NO LANCE"}
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
                        {venueName(cam.venue_id)} · {cam.name}
                      </div>
                    </div>
                    <div className="brand" style={{ fontSize: 26, color: busy ? "var(--bg)" : "var(--accent)" }}>
                      ▶
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderTop: "1px solid var(--line)",
                    background: "rgba(10,10,10,0.92)",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--muted)", flex: 1, minWidth: 120 }}>
                    USB:{" "}
                    <strong style={{ color: key ? "var(--accent)" : "var(--warn)" }}>
                      {listening ? "aguardando…" : key || "não definida"}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setListeningId(cam.id);
                      setMessage(null);
                    }}
                    style={ghostBtn}
                  >
                    {listening ? "Aperte o botão…" : "Tecla USB"}
                  </button>
                  {key && !listening && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearKey(cam.id);
                      }}
                      style={{ ...ghostBtn, color: "var(--muted)", borderColor: "var(--line)" }}
                    >
                      Limpar
                    </button>
                  )}
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
  background: "rgba(0,0,0,0.25)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  padding: "10px 12px",
  minWidth: 180,
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--line)",
  color: "var(--accent)",
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};
