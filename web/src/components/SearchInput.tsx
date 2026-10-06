type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  count?: { shown: number; total: number };
};

export function SearchInput({ value, onChange, placeholder = "Buscar…", count }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 480 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
            pointerEvents: "none",
          }}
        >
          ⌕
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid var(--line)",
            color: "var(--text)",
            padding: "10px 12px 10px 32px",
            outline: "none",
          }}
        />
      </div>
      {count && value.trim() && (
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          {count.shown} de {count.total}
        </span>
      )}
    </div>
  );
}

/** Case/accent-insensitive match of query against any of the given fields. */
export function matchesSearch(query: string, ...fields: (string | number | null | undefined)[]): boolean {
  const q = normalize(query);
  if (!q) return true;
  const haystack = normalize(fields.filter((f) => f != null).join(" "));
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
