import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Absolute public URL for the participant signup screen. */
export function signupUrl(): string {
  if (typeof window === "undefined") return "/cadastro";
  return `${window.location.origin}/cadastro`;
}

export function SignupShare({ compact = false }: { compact?: boolean }) {
  const url = signupUrl();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: compact ? 160 : 220,
      margin: 2,
      color: { dark: "#111111", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then((data) => {
      if (!cancelled) setQr(data);
    });
    return () => {
      cancelled = true;
    };
  }, [url, compact]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie o link:", url);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        padding: compact ? 14 : 16,
        border: "1px solid var(--line)",
        background: "var(--card)",
        borderRadius: "var(--radius)",
        maxWidth: compact ? 420 : 560,
      }}
    >
      <div>
        <strong style={{ fontSize: compact ? 16 : 18 }}>Cadastro do participante</strong>
        <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
          Compartilhe o link ou o QR code. Abre direto a tela de criar conta por e-mail.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div
          style={{
            padding: 10,
            background: "#fff",
            borderRadius: 12,
            lineHeight: 0,
          }}
        >
          {qr ? (
            <img src={qr} alt="QR code do cadastro" width={compact ? 160 : 220} height={compact ? 160 : 220} />
          ) : (
            <div
              style={{
                width: compact ? 160 : 220,
                height: compact ? 160 : 220,
                display: "grid",
                placeItems: "center",
                color: "#666",
                fontSize: 13,
              }}
            >
              Gerando QR…
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 10, flex: 1, minWidth: 200 }}>
          <code
            style={{
              display: "block",
              padding: "10px 12px",
              background: "var(--field)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              wordBreak: "break-all",
              color: "var(--text)",
            }}
          >
            {url}
          </code>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void copy()} style={btnStyle}>
              {copied ? "Copiado!" : "Copiar link"}
            </button>
            <a href={url} target="_blank" rel="noreferrer" style={{ ...btnStyle, ...ghostAsLink }}>
              Abrir cadastro
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  borderRadius: 8,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const ghostAsLink: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--line)",
};
