import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AD_PLACEMENT_LABELS, api, type Ad, type AdPlacement } from "../lib/api";

export function AdUploadForm({ venueId, cameraId }: { venueId?: number; cameraId?: number }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>("bottom");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Selecione uma imagem");
      return api.ads.create({
        title: title || file.name,
        file,
        placement,
        venue_id: venueId ?? null,
        camera_id: cameraId ?? null,
      });
    },
    onSuccess: () => {
      setTitle("");
      setFile(null);
      setInputKey((k) => k + 1);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["ads"] });
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
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "1.2fr 1.2fr 1.4fr auto",
        }}
      >
        <input
          placeholder="Título (ex: Patrocinador X)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
        <select value={placement} onChange={(e) => setPlacement(e.target.value as AdPlacement)} style={inputStyle}>
          <option value="bottom">{AD_PLACEMENT_LABELS.bottom}</option>
          <option value="top">{AD_PLACEMENT_LABELS.top}</option>
        </select>
        <input
          key={inputKey}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ ...inputStyle, padding: 7, minWidth: 0 }}
        />
        <button type="submit" style={btnStyle} disabled={create.isPending || !file}>
          {create.isPending ? "Enviando…" : "Enviar"}
        </button>
      </form>
      {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
    </>
  );
}

export function AdList({ ads, emptyText }: { ads: Ad[]; emptyText: string }) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["ads"] });
  const onError = (e: Error) => window.alert(e.message);
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.ads.update(id, { active }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({ mutationFn: (id: number) => api.ads.remove(id), onSuccess: refresh, onError });

  if (ads.length === 0) return <div style={{ color: "var(--muted)", fontSize: 13 }}>{emptyText}</div>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {ads.map((ad) => (
        <div
          key={ad.id}
          className="ad-row"
          style={{
            display: "grid",
            gridTemplateColumns: "140px minmax(0, 1fr) auto",
            gap: 12,
            padding: 10,
            border: "1px solid var(--line)",
            background: "rgba(0,0,0,0.2)",
            alignItems: "center",
            opacity: ad.active ? 1 : 0.6,
          }}
        >
          <img
            src={api.ads.imageUrl(ad.id)}
            alt={ad.title}
            style={{ width: "100%", height: 70, objectFit: "contain", background: "#000" }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{ad.title}</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              <span style={{ color: ad.active ? "var(--accent-2)" : "var(--warn)" }}>
                {ad.active ? "ativa" : "pausada"}
              </span>{" "}
              · {AD_PLACEMENT_LABELS[ad.placement]}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={ghostBtn}
              onClick={() => toggle.mutate({ id: ad.id, active: !ad.active })}
              disabled={toggle.isPending}
            >
              {ad.active ? "Pausar" : "Ativar"}
            </button>
            <button
              type="button"
              style={{ ...ghostBtn, color: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={() => {
                if (window.confirm(`Apagar "${ad.title}"?`)) remove.mutate(ad.id);
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

export const adSectionBox: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 16,
  border: "1px solid var(--line)",
  background: "rgba(26,26,26,0.7)",
};

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

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--line)",
  color: "var(--text)",
  padding: "8px 12px",
  cursor: "pointer",
};
