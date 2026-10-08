import { useEffect, useRef, useState } from "react";
import { LivePlayer } from "./LivePlayer";
import { liveUrl, snapshotUrl, type Camera } from "../lib/api";

const REFRESH_MS = 5000;

type Props = {
  camera: Camera;
  live: boolean;
  onToggleLive: () => void;
};

/**
 * Still frame refreshed every few seconds (only while on screen); the live MPEG-TS
 * stream is opened only when the user asks for it, sparing server bandwidth and
 * the browser's video decoder.
 */
export function CameraPreview({ camera, live, onToggleLive }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const snap = snapshotUrl(camera);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (live || !snap || !visible) return;
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      const next = `${snap}?t=${Date.now()}`;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          setImage(next);
          setFailed(false);
        }
      };
      img.onerror = () => !cancelled && setFailed(true);
      img.src = next;
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [snap, live, visible]);

  if (live) {
    return (
      <div style={{ position: "relative" }}>
        <LivePlayer src={liveUrl(camera)} />
        <button type="button" onClick={onToggleLive} style={{ ...badge, cursor: "pointer" }}>
          ⏸ Pausar ao vivo
        </button>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      role="button"
      tabIndex={0}
      onClick={onToggleLive}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onToggleLive();
        }
      }}
      title="Ver ao vivo"
      style={{
        position: "relative",
        aspectRatio: "16 / 9",
        background: "#000",
        border: "1px solid var(--line)",
        cursor: "pointer",
        overflow: "hidden",
        outline: "none",
      }}
    >
      {image && (
        <img
          src={image}
          alt={camera.name}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      )}
      {!image && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--muted)" }}>
          {!snap ? "Câmera offline" : failed ? "Aguardando imagem…" : "Carregando…"}
        </div>
      )}
      {snap && <span style={badge}>▶ Ver ao vivo</span>}
    </div>
  );
}

const badge: React.CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  zIndex: 8,
  padding: "6px 10px",
  background: "rgba(10,10,10,0.8)",
  border: "1px solid var(--accent)",
  color: "var(--accent)",
  fontWeight: 700,
  fontSize: 13,
};
