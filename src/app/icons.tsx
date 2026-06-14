/* Minimal stroke icons (Lucide-style) used across the UI. */

type P = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ArrowUp({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function Stop({ className }: P) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

export function Plus({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Trash({ className }: P) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

export function Sidebar({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

export function Copy({ className }: P) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function Check({ className }: P) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function Refresh({ className }: P) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function Sun({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function Moon({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function Wrench({ className }: P) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-2.1Z" />
    </svg>
  );
}
