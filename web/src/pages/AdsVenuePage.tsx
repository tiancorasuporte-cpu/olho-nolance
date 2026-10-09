import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdList, AdUploadForm, adSectionBox } from "../components/AdManager";
import { api } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";

export function AdsVenuePage({ venueId }: { venueId: number }) {
  const { user } = useAuth();
  const venues = useQuery({ queryKey: ["venues"], queryFn: api.venues.list });
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api.cameras.list() });
  const ads = useQuery({ queryKey: ["ads", "all"], queryFn: () => api.ads.list(), enabled: isAdmin(user) });

  if (!isAdmin(user)) {
    return <div style={{ color: "var(--muted)" }}>Acesso restrito a admins.</div>;
  }

  const venue = venues.data?.find((v) => v.id === venueId);
  const venueCams = (cameras.data || []).filter((c) => c.venue_id === venueId);
  const allAds = ads.data || [];
  const venueAds = allAds.filter((a) => a.venue_id === venueId && a.camera_id == null);
  const camAds = (cameraId: number) => allAds.filter((a) => a.camera_id === cameraId);

  const back = (
    <Link to="/propaganda" style={{ color: "var(--muted)", fontSize: 14 }}>
      ← Propaganda · todas as quadras
    </Link>
  );

  if (venues.isLoading) return <div style={{ color: "var(--muted)" }}>Carregando…</div>;
  if (!venue) {
    return (
      <div className="fade-up" style={{ display: "grid", gap: 12 }}>
        {back}
        <div style={{ color: "var(--muted)" }}>Quadra não encontrada.</div>
      </div>
    );
  }

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        {back}
        <h1 style={{ margin: 0, fontSize: 42, color: "var(--accent)", textTransform: "uppercase" }}>
          {venue.name}
        </h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Propagandas desta quadra. Em cada faixa do vídeo vale a da câmera; se a câmera não tiver, a da
          quadra; se a quadra não tiver, a geral.
        </p>
      </div>

      <section style={adSectionBox}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Todas as câmeras desta quadra</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Entra nos lances de qualquer câmera da quadra que não tenha propaganda própria.
          </div>
        </div>
        <AdUploadForm venueId={venueId} />
        <AdList ads={venueAds} emptyText="Nenhuma propaganda da quadra." />
      </section>

      <h2 style={{ margin: 0, fontSize: 22, textTransform: "uppercase" }}>Câmeras ({venueCams.length})</h2>
      {venueCams.length === 0 && (
        <div style={{ color: "var(--muted)" }}>
          Nenhuma câmera nesta quadra.{" "}
          <Link to="/quadras/$venueId" params={{ venueId: String(venueId) }} style={{ color: "var(--accent)" }}>
            Cadastrar câmera
          </Link>
        </div>
      )}
      {venueCams.map((c) => {
        const list = camAds(c.id);
        return (
          <section key={c.id} style={adSectionBox}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                <span style={{ color: "var(--accent)" }}>ID {c.id}</span> · {c.name}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {list.some((a) => a.active)
                  ? "Os lances desta câmera usam estas propagandas nas faixas onde houver uma ativa."
                  : "Sem propaganda própria: usa a da quadra (ou a geral)."}
              </div>
            </div>
            <AdUploadForm venueId={venueId} cameraId={c.id} />
            <AdList ads={list} emptyText="Nenhuma propaganda nesta câmera." />
          </section>
        );
      })}

      <style>{`
        @media (max-width: 900px) {
          .ad-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
