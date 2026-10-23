import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type EmailSettings } from "../lib/api";
import { isGlobalAdmin, useAuth } from "../lib/auth";

const PRESETS = [1, 3, 7, 15, 30, 90];

const emptyEmail = {
  host: "",
  smtp_port: 587,
  imap_port: 993,
  username: "",
  password: "",
  from_email: "",
  from_name: "ONL Sports",
  use_ssl: false,
};

export function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const emailSettings = useQuery({
    queryKey: ["settings", "email"],
    queryFn: api.settings.getEmail,
    enabled: isGlobalAdmin(user),
  });
  const [days, setDays] = useState(3);
  const [keepForever, setKeepForever] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState(emptyEmail);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    const current = settings.data.clip_retention_days;
    setKeepForever(current === 0);
    if (current > 0) setDays(current);
  }, [settings.data]);

  useEffect(() => {
    if (!emailSettings.data) return;
    const e = emailSettings.data;
    setEmailForm({
      host: e.host,
      smtp_port: e.smtp_port,
      imap_port: e.imap_port,
      username: e.username,
      password: "",
      from_email: e.from_email,
      from_name: e.from_name || "ONL Sports",
      use_ssl: e.use_ssl,
    });
  }, [emailSettings.data]);

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

  const saveEmail = useMutation({
    mutationFn: () => api.settings.updateEmail(emailForm),
    onSuccess: (res: EmailSettings) => {
      setEmailErr(null);
      setEmailMsg(
        res.configured
          ? "E-mail salvo. Use os botões abaixo para testar IMAP (leitura) e SMTP (envio)."
          : "Salvo, mas ainda faltam host, usuário ou senha.",
      );
      void qc.invalidateQueries({ queryKey: ["settings", "email"] });
      setEmailForm((f) => ({ ...f, password: "" }));
    },
    onError: (e: Error) => {
      setEmailMsg(null);
      setEmailErr(e.message);
    },
  });

  const testImap = useMutation({
    mutationFn: api.settings.testImap,
    onSuccess: (r) => {
      setEmailErr(null);
      setEmailMsg(r.message);
    },
    onError: (e: Error) => {
      setEmailMsg(null);
      setEmailErr(e.message);
    },
  });

  const testSmtp = useMutation({
    mutationFn: api.settings.testSmtp,
    onSuccess: (r) => {
      setEmailErr(null);
      setEmailMsg(r.message);
    },
    onError: (e: Error) => {
      setEmailMsg(null);
      setEmailErr(e.message);
    },
  });

  if (!isGlobalAdmin(user)) {
    return <div style={{ color: "var(--muted)" }}>Acesso restrito a admins.</div>;
  }

  const emailReady = emailSettings.data?.configured;

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
        style={cardStyle}
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setEmailMsg(null);
          setEmailErr(null);
          saveEmail.mutate();
        }}
        style={cardStyle}
      >
        <div>
          <strong style={{ fontSize: 18 }}>E-mail (IMAP / SMTP)</strong>
          <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
            Usado para enviar o código de confirmação do participante e o código de “esqueci a senha”.
            No painel do seu provedor costuma aparecer <b>IMAP</b> (ler) e <b>SMTP</b> (enviar) no mesmo
            servidor — informe os dois. Status:{" "}
            {emailReady ? (
              <span style={{ color: "var(--accent-2)" }}>configurado</span>
            ) : (
              <span style={{ color: "var(--danger)" }}>ainda não configurado</span>
            )}
            .
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }} className="email-form">
          <label style={labelStyle}>
            Servidor (host)
            <input
              required
              placeholder="mail.seudominio.com.br"
              value={emailForm.host}
              onChange={(e) => setEmailForm({ ...emailForm, host: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Porta SMTP
            <input
              type="number"
              required
              value={emailForm.smtp_port}
              onChange={(e) => {
                const smtp_port = Number(e.target.value) || 587;
                setEmailForm({
                  ...emailForm,
                  smtp_port,
                  use_ssl: smtp_port === 465 ? true : smtp_port === 587 ? false : emailForm.use_ssl,
                });
              }}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Porta IMAP
            <input
              type="number"
              required
              value={emailForm.imap_port}
              onChange={(e) => setEmailForm({ ...emailForm, imap_port: Number(e.target.value) || 993 })}
              style={inputStyle}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="email-form">
          <label style={labelStyle}>
            Usuário / e-mail da caixa
            <input
              required
              type="email"
              placeholder="noreply@seudominio.com.br"
              value={emailForm.username}
              onChange={(e) => setEmailForm({ ...emailForm, username: e.target.value })}
              style={inputStyle}
              autoComplete="off"
            />
          </label>
          <label style={labelStyle}>
            Senha {emailSettings.data?.password_set ? "(deixe vazio para manter)" : ""}
            <input
              type="password"
              placeholder={emailSettings.data?.password_set ? "••••••••" : "Senha do e-mail"}
              value={emailForm.password}
              onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
              style={inputStyle}
              autoComplete="new-password"
              required={!emailSettings.data?.password_set}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="email-form">
          <label style={labelStyle}>
            Remetente (From)
            <input
              type="email"
              placeholder="mesmo e-mail ou outro autorizado"
              value={emailForm.from_email}
              onChange={(e) => setEmailForm({ ...emailForm, from_email: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Nome do remetente
            <input
              value={emailForm.from_name}
              onChange={(e) => setEmailForm({ ...emailForm, from_name: e.target.value })}
              style={inputStyle}
            />
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={emailForm.use_ssl}
            onChange={(e) => setEmailForm({ ...emailForm, use_ssl: e.target.checked })}
          />
          SMTP com SSL (porta 465). Desmarcado = STARTTLS (porta 587, o mais comum).
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" style={btnStyle} disabled={saveEmail.isPending}>
            {saveEmail.isPending ? "Salvando…" : "Salvar e-mail"}
          </button>
          <button
            type="button"
            style={ghostBtn}
            disabled={testImap.isPending || !emailForm.host}
            onClick={() => {
              setEmailMsg(null);
              setEmailErr(null);
              testImap.mutate();
            }}
          >
            {testImap.isPending ? "Testando…" : "Testar IMAP"}
          </button>
          <button
            type="button"
            style={ghostBtn}
            disabled={testSmtp.isPending || !emailForm.host}
            onClick={() => {
              setEmailMsg(null);
              setEmailErr(null);
              testSmtp.mutate();
            }}
          >
            {testSmtp.isPending ? "Testando…" : "Testar SMTP"}
          </button>
        </div>
        {emailMsg && <div style={{ color: "var(--accent-2)" }}>{emailMsg}</div>}
        {emailErr && <div style={{ color: "var(--danger)" }}>{emailErr}</div>}
      </form>

      <style>{`
        @media (max-width: 800px) {
          .email-form { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 16,
  border: "1px solid var(--line)",
  background: "var(--card)",
  borderRadius: "var(--radius)",
  maxWidth: 720,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  color: "var(--muted)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--field)",
  borderRadius: "var(--radius-sm)",
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

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--line)",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 600,
};
