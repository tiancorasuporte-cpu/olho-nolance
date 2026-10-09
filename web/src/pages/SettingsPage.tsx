import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { isGlobalAdmin, useAuth } from "../lib/auth";

const PRESETS = [1, 3, 7, 15, 30, 90];

export function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const [days, setDays] = useState(3);
  const [keepForever, setKeepForever] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    const current = settings.data.clip_retention_days;
    setKeepForever(current === 0);
    if (current > 0) setDays(current);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.settings.update({ clip_retention_days: keepForever ? 0 : days }),
    onSuccess: (res) => {
      setMessage(
        res.clip_retention_days === 0
          ? "Salvo. Os lances não serão apagados automaticamente."
          : `Salvo. Lances com mais de ${res.clip_retention_days} dia(s) serão apagados automaticamente.` +
              (res.removed_clips > 0 ? ` ${res.removed_clips} lance(s) antigo(s) foram removidos agora.` : ""),
      );
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["clips"] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  if (!isGlobalAdmin(user)) {
    return <div style={{ color: "var(--muted)" }}>Acesso restrito a admins.</div>;
  }

  return (
    <div className="fade-up" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 className="page-title">Configurações</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>Regras gerais do sistema.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          if (!keepForever && days < 1) return;
          if (
            !keepForever &&
            !window.confirm(`Lances com mais de ${days} dia(s) serão apagados permanentemente. Continuar?`)
          )
            return;
          save.mutate();
        }}
        style={{
          display: "grid",
          gap: 14,
          padding: 16,
          border: "1px solid var(--line)",
          background: "var(--card)", borderRadius: "var(--radius)",
          maxWidth: 640,
        }}
      >
        <div>
          <strong style={{ fontSize: 18 }}>Apagar lances automaticamente</strong>
          <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
            Vídeos mais antigos que o prazo são apagados do servidor e do histórico. A verificação roda a
            cada 5 minutos.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PRESETS.map((p) => {
            const active = !keepForever && days === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setKeepForever(false);
                  setDays(p);
                }}
                style={{
                  padding: "8px 14px",
                  border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--bg)" : "var(--text)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {p} {p === 1 ? "dia" : "dias"}
              </button>
            );
          })}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          Outro prazo:
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            disabled={keepForever}
            onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
            style={{ ...inputStyle, width: 90 }}
          />
          dias
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={keepForever} onChange={(e) => setKeepForever(e.target.checked)} />
          Nunca apagar (guardar para sempre)
        </label>

        <button type="submit" style={btnStyle} disabled={save.isPending || settings.isLoading}>
          {save.isPending ? "Salvando…" : "Salvar"}
        </button>
        {message && <div style={{ color: save.isError ? "var(--danger)" : "var(--accent-2)" }}>{message}</div>}
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--field)", borderRadius: "var(--radius-sm)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  padding: "8px 10px",
};

const btnStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
  justifySelf: "start",
};
