import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { AD_PLACEMENT_LABELS, api, type AdPlacement } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";

export function AdsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const ads = useQuery({
    queryKey: ["ads", "all"],
    queryFn: () => api.ads.list(),
    enabled: isAdmin(user),
  });

  const [title, setTitle] = useState("");
  const [venueId, setVenueId] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>("bottom");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const create = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Selecione uma imagem");
      return api.ads.create({
        title: title || file.name,
        file,
        placement,
        venue_id: venueId ? Number(venueId) : null,
      });
    },
    onSuccess: () => {
      setTitle("");
      setFile(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["ads"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.ads.update(id, { active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ads"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.ads.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ads"] }),
  });

  const venueName = (id: number | null) =>
    id == null ? "todas as quadras" : venues.data?.find((v) => v.id === id)?.name || `quadra #${id}`;
  const allAds = ads.data || [];
  const visibleAds = allAds.filter((ad) =>
    matchesSearch(
      query,
      ad.title,
      venueName(ad.venue_id),
      ad.active ? "ativa" : "inativa",
      AD_PLACEMENT_LABELS[ad.placement],
    ),
  );

  if (!isAdmin(user)) {
    return <div style={{ color: "var(--muted)" }}>Acesso restrito a admins.</div>;
  }

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>PROPAGANDA</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          Os lances saem no formato de celular (1080×1920, 9:16), prontos para Stories do
          Instagram e Status do WhatsApp. As imagens ativas são gravadas nas faixas do vídeo.
        </p>
      </div>

      <div style={layoutBox} className="ads-layout">
        <div style={phoneMock}>
          <div style={{ ...mockBar, height: "12.5%", borderBottom: "2px solid var(--accent)" }}>
            faixa superior
          </div>
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--muted)" }}>vídeo</div>
          <div
            style={{
              ...mockBar,
              height: "18.75%",
              borderTop: "2px solid var(--accent)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
            }}
          >
            <span>1</span>
            <span>2</span>
            <span>3</span>
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, fontSize: 14, alignContent: "start" }}>
          <strong style={{ color: "var(--accent)" }}>Dimensões recomendadas (PNG com fundo transparente fica melhor)</strong>
          <div>
            <b>Faixa superior</b>: 1 imagem de <b>1080 × 240 px</b> (logo da arena / patrocinador master).
          </div>
          <div>
            <b>Faixa inferior</b>: até 3 patrocinadores lado a lado, pela ordem de cadastro.
            <br />1 imagem: <b>1080 × 360 px</b> · 2 imagens: <b>540 × 360 px</b> cada · 3 imagens:{" "}
            <b>360 × 360 px</b> cada.
          </div>
          <div style={{ color: "var(--muted)" }}>
            O vídeo ocupa o espaço que sobra (1080 × 1320 com as duas faixas), com corte central da
            câmera. Imagens de outro tamanho são encaixadas sem distorcer. Sem propaganda, o vídeo
            ocupa a tela toda.
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "1.3fr 1fr 1.3fr 1.2fr auto",
          padding: 16,
          border: "1px solid var(--line)",
          background: "rgba(26,26,26,0.7)",
        }}
        className="ads-form"
      >
        <input
          placeholder="Título (ex: Patrocinador X)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
        <select value={venueId} onChange={(e) => setVenueId(e.target.value)} style={inputStyle}>
          <option value="">Todas as quadras</option>
          {(venues.data || []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select
          value={placement}
          onChange={(e) => setPlacement(e.target.value as AdPlacement)}
          style={inputStyle}
        >
          <option value="bottom">{AD_PLACEMENT_LABELS.bottom}</option>
          <option value="top">{AD_PLACEMENT_LABELS.top}</option>
        </select>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ ...inputStyle, padding: 8 }}
        />
        <button type="submit" style={btnStyle} disabled={create.isPending || !file}>
          Enviar
        </button>
      </form>
      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar propaganda por título ou quadra…"
        count={{ shown: visibleAds.length, total: allAds.length }}
      />

      <div style={{ display: "grid", gap: 12 }}>
        {visibleAds.map((ad) => (
          <div
            key={ad.id}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr auto",
              gap: 14,
              padding: 12,
              border: "1px solid var(--line)",
              background: "rgba(0,0,0,0.2)",
              alignItems: "center",
            }}
            className="ad-row"
          >
            <img
              src={api.ads.imageUrl(ad.id)}
              alt={ad.title}
              style={{ width: "100%", height: 90, objectFit: "contain", background: "#000" }}
            />
            <div>
              <div style={{ fontWeight: 700 }}>{ad.title}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {ad.active ? "ativa" : "inativa"} · {AD_PLACEMENT_LABELS[ad.placement]} ·{" "}
                {venueName(ad.venue_id)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={ghostBtn}
                onClick={() => toggle.mutate({ id: ad.id, active: !ad.active })}
              >
                {ad.active ? "Pausar" : "Ativar"}
              </button>
              <button
                type="button"
                style={{ ...ghostBtn, color: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={() => {
                  if (window.confirm(`Apagar "${ad.title}"?`)) remove.mutate(ad.id);
                }}
              >
                Apagar
              </button>
            </div>
          </div>
        ))}
        {allAds.length === 0 && (
          <div style={{ color: "var(--muted)" }}>Nenhuma propaganda cadastrada ainda.</div>
        )}
        {allAds.length > 0 && visibleAds.length === 0 && (
          <div style={{ color: "var(--muted)" }}>Nenhuma propaganda encontrada.</div>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .ads-form, .ad-row, .ads-layout { grid-template-columns: 1fr !important; }
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

const layoutBox: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "120px 1fr",
  gap: 20,
  padding: 16,
  border: "1px solid var(--line)",
  background: "rgba(26,26,26,0.7)",
};

const phoneMock: React.CSSProperties = {
  width: 108,
  height: 192,
  display: "flex",
  flexDirection: "column",
  border: "2px solid var(--line)",
  borderRadius: 10,
  overflow: "hidden",
  background: "linear-gradient(160deg, #3a2a1f, #141414)",
  fontSize: 10,
};

const mockBar: React.CSSProperties = {
  background: "#0a0a0a",
  color: "var(--muted)",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--line)",
  color: "var(--text)",
  padding: "8px 12px",
  cursor: "pointer",
};
