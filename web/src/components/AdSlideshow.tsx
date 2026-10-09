import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Ad } from "../lib/api";

type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

type Props = {
  venueId?: number | null;
  /** When true, floats in a corner (for camera overlay). Hides if no ads. */
  overlay?: boolean;
  corner?: Corner;
  className?: string;
  /** Used only in non-overlay mode */
  height?: number | string;
};

export function AdSlideshow({
  venueId,
  overlay = false,
  corner = "bottom-right",
  className,
  height = 220,
}: Props) {
  const ads = useQuery({
    queryKey: ["ads", "active", venueId ?? "all"],
    queryFn: () =>
      api.ads.list({
        active_only: true,
        venue_id: venueId ?? undefined,
      }),
    refetchInterval: 30_000,
  });

  const items = ads.data || [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [items.length, venueId]);

  useEffect(() => {
    if (items.length <= 1) return;
    const current = items[index % items.length];
    const ms = Math.max(3, current?.duration_sec || 8) * 1000;
    const t = window.setTimeout(() => {
      setIndex((i) => (i + 1) % items.length);
    }, ms);
    return () => window.clearTimeout(t);
  }, [items, index]);

  if (!items.length) {
    if (overlay) return null;
    return (
      <div
        className={className}
        style={{
          height,
          border: "1px dashed var(--line)",
          display: "grid",
          placeItems: "center",
          color: "var(--muted)",
          background: "var(--card-2)", borderRadius: "var(--radius-sm)",
          fontSize: 14,
        }}
      >
        Sem propaganda ativa
      </div>
    );
  }

  const ad: Ad = items[index % items.length];

  const cornerPos: React.CSSProperties =
    corner === "bottom-right"
      ? { right: 12, bottom: 12 }
      : corner === "bottom-left"
        ? { left: 12, bottom: 12 }
        : corner === "top-right"
          ? { right: 12, top: 12 }
          : { left: 12, top: 12 };

  if (overlay) {
    return (
      <div
        className={className}
        style={{
          position: "absolute",
          ...cornerPos,
          zIndex: 5,
          width: "min(28%, 220px)",
          aspectRatio: "16 / 9",
          overflow: "hidden",
          border: "2px solid rgba(255, 107, 0, 0.85)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
          background: "#000",
          pointerEvents: "none",
        }}
      >
        <img
          key={ad.id}
          src={api.ads.imageUrl(ad.id)}
          alt={ad.title}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            animation: "fade-up 0.35s ease",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        position: "relative",
        height,
        overflow: "hidden",
        border: "1px solid var(--line)",
        background: "#000",
      }}
    >
      <img
        key={ad.id}
        src={api.ads.imageUrl(ad.id)}
        alt={ad.title}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          animation: "fade-up 0.4s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "8px 12px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
          color: "var(--text)",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {ad.title}
      </div>
    </div>
  );
}
