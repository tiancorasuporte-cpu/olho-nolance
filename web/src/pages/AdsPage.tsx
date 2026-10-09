import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdList, AdUploadForm, adSectionBox } from "../components/AdManager";
import { SearchInput, matchesSearch } from "../components/SearchInput";
import { api } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";

export function AdsPage() {
  const { user } = useAuth();
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras.list() });
  const ads = useQuery({ queryKey: ["ads", "all"], queryFn: () => api.ads.list(), enabled: isAdmin(user) });
  const [query, setQuery] = useState("");

  if (!isAdmin(user)) {
    return <div style={{ color: "var(--muted)" }}>Acesso restrito a admins.</div>;
  }

  const allAds = ads.data || [];
  const globalAds = allAds.filter((a) => a.venue_id == null && a.camera_id == null);
  const allVenues = venues.data || [];
  const visibleVenues = allVenues.filter((v) => matchesSearch(query, v.id, v.name, v.city));
  const camCount = (venueId: number) => (cameras.data || []).filter((c) => c.venue_id === venueId).length;
  const adsOf = (venueId: number) => allAds.filter((a) => a.venue_id === venueId);

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)" }}>PROPAGANDA</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
          Os lances saem no formato de celular (1080×1920, 9:16), prontos para Stories do
          Instagram e Status do WhatsApp. As imagens ativas são gravadas nas faixas do vídeo.
        </p>
      </div>

      <AdGuide />

      <section style={adSectionBox}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Propagandas gerais (todas as quadras)</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Usadas quando a quadra e a câmera não têm propaganda própria naquela faixa.
          </div>
        </div>
        <AdUploadForm />
        <AdList ads={globalAds} emptyText="Nenhuma propaganda geral." />
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 22, textTransform: "uppercase" }}>Quadras</h2>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Buscar quadra por nome ou cidade…"
          count={{ shown: visibleVenues.length, total: allVenues.length }}
        />
        {visibleVenues.length === 0 && <div style={{ color: "var(--muted)" }}>Nenhuma quadra encontrada.</div>}
        {visibleVenues.map((v) => {
          const venueAds = adsOf(v.id);
          const active = venueAds.filter((a) => a.active).length;
          const cams = camCount(v.id);
          return (
            <Link
              key={v.id}
              to="/propaganda/$venueId"
              params={{ venueId: String(v.id) }}
              className="venue-card"
              style={cardLink}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {v.name}
                  {v.city && <span style={{ color: "var(--accent)", fontWeight: 600 }}> · {v.city}</span>}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>
                  {cams} {cams === 1 ? "câmera" : "câmeras"} · {venueAds.length}{" "}
                  {venueAds.length === 1 ? "propaganda" : "propagandas"}
                  {venueAds.length > 0 && ` (${active} ativas)`}
                </div>
              </div>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>Abrir →</span>
            </Link>
          );
        })}
      </section>

      <style>{`
        .venue-card:hover { border-color: var(--accent) !important; }
        @media (max-width: 900px) {
          .ad-row, .ads-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function AdGuide() {
  return (
    <div style={layoutBox} className="ads-layout">
      <div style={phoneMock}>
        <div style={{ ...mockBar, height: "12.5%", borderBottom: "2px solid var(--accent)" }}>faixa superior</div>
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
        <div>
          <b>Prioridade</b>: em cada faixa vale a propaganda da <b>câmera</b>; se a câmera não tiver, a da{" "}
          <b>quadra</b>; se a quadra não tiver, a <b>geral</b>.
        </div>
        <div style={{ color: "var(--muted)" }}>
          O vídeo ocupa o espaço que sobra (1080 × 1320 com as duas faixas), com corte central da câmera.
          Imagens de outro tamanho são encaixadas sem distorcer. Sem propaganda, o vídeo ocupa a tela toda.
        </div>
      </div>
    </div>
  );
}

const cardLink: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 12,
  padding: 16,
  border: "1px solid var(--line)",
  background: "rgba(0,0,0,0.2)",
  color: "inherit",
  textDecoration: "none",
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
