import { useEffect, useRef, useState } from "react";
import mpegts from "mpegts.js";

type Props = {
  src: string | null;
  className?: string;
};

export function LivePlayer({ src, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    setError(null);
    if (!video || !src) return;

    if (!mpegts.getFeatureList().mseLivePlayback) {
      setError("Este navegador não suporte MSE live. Use Chrome/Edge.");
      return;
    }

    let cancelled = false;
    let player: ReturnType<typeof mpegts.createPlayer> | null = null;

    const start = async () => {
      try {
        const statusUrl = src.replace(/\/stream\.ts(?:\?.*)?$/, "/status");
        const probe = await fetch(statusUrl, { cache: "no-store" });
        if (probe.ok) {
          const body = (await probe.json()) as { running?: boolean };
          if (!body.running) {
            if (!cancelled) {
              setError("Stream offline. Em Câmeras, clique Start e aguarde alguns segundos.");
            }
            return;
          }
        }
      } catch {
        if (!cancelled) {
          setError("Não foi possível conectar no media. Verifique se o Docker está no ar.");
        }
        return;
      }

      if (cancelled || !videoRef.current) return;

      player = mpegts.createPlayer(
        {
          type: "mse",
          isLive: true,
          url: src,
        },
        {
          enableWorker: true,
          enableStashBuffer: false,
          stashInitialSize: 128,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 1.5,
          liveBufferLatencyMinRemain: 0.3,
          liveSync: true,
        },
      );

      player.attachMediaElement(videoRef.current);
      player.load();
      void player.play().catch(() => undefined);

      player.on(mpegts.Events.ERROR, () => {
        if (!cancelled) {
          setError("Falha no decode do stream. Tente Stop/Start na câmera.");
        }
      });
    };

    void start();

    return () => {
      cancelled = true;
      if (player) {
        try {
          player.pause();
          player.unload();
          player.detachMediaElement();
          player.destroy();
        } catch {
          /* ignore */
        }
      }
    };
  }, [src]);

  if (!src) {
    return (
      <div
        className={className}
        style={{
          position: "relative",
          background: "rgba(0,0,0,0.35)",
          border: "1px solid var(--line)",
          display: "grid",
          placeItems: "center",
          color: "var(--muted)",
          minHeight: 240,
          aspectRatio: "16 / 9",
        }}
      >
        Sem stream ao vivo
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <video
        ref={videoRef}
        className={className}
        muted
        playsInline
        autoPlay
        controls
        style={{
          width: "100%",
          background: "#000",
          border: "1px solid var(--line)",
          aspectRatio: "16 / 9",
          objectFit: "contain",
          display: "block",
        }}
      />
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,0.65)",
            color: "var(--warn)",
            padding: 24,
            textAlign: "center",
            fontWeight: 600,
            zIndex: 6,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
