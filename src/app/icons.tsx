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

export function Mic({ className }: P) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
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

export function Sparkles({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
    </svg>
  );
}

export function Paperclip({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
    </svg>
  );
}

export function Globe({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

export function ImageIcon({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

export function Bot({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M12 4v4M8 13h.01M16 13h.01M9 19v2M15 19v2" />
    </svg>
  );
}

export function Settings({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function User({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function X({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function LogIn({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
    </svg>
  );
}

export function LogOut({ className }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base} className={className} aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

/* ---- Animated, tool-specific icons (CSS keyframes in globals.css). ---- */

/** Map a tool name to an animated icon for the ToolChip. */
export function ToolGlyph({ name, running }: { name: string; running: boolean }) {
  const cls = "h-[13px] w-[13px] " + (running ? "tool-glyph-spin" : "");
  const n = name.toLowerCase();
  if (n.includes("image") || n.includes("generateimage")) return <ImageIcon className={cls} />;
  if (n.includes("worker")) return <Bot className={cls} />;
  if (n.includes("weather") || n.includes("forecast")) return <Sun className={cls} />;
  if (n.includes("email") || n.includes("mail")) return <Paperclip className={cls} />;
  if (
    n.includes("web") || n.includes("url") || n.includes("wiki") ||
    n.includes("news") || n.includes("search") || n.includes("crypto") ||
    n.includes("currency") || n.includes("country") || n.includes("ip")
  )
    return <Globe className={cls} />;
  return <Wrench className={cls} />;
}
