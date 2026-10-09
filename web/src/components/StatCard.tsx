const ICONS = {
  venue: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  camera: (
    <>
      <rect x="2.5" y="6.5" width="13" height="11" rx="2" />
      <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
    </>
  ),
  online: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  button: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
};

export type StatIcon = keyof typeof ICONS;

export function StatCard({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: StatIcon;
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`stat-card${accent ? " accent" : ""}`}>
      <span className="stat-icon" aria-hidden>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICONS[icon]}
        </svg>
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}
