import { useStore } from '../lib/store';

/** Brand mark: the ouroboros — a closed circle that guards its own keyhole. */
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <path d="M21.7 6.13 A11.4 11.4 0 1 1 6.13 10.3" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
      <path d="M16.6 4.62 A11.4 11.4 0 0 1 21.7 6.13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.5 11.7 C4 7.9 6.9 4.8 10.8 4.25 L17.4 3.6 L12.4 7.75 C10.6 9.3 8.2 10.95 4.5 11.7 Z" fill="currentColor" />
      <circle cx="9.05" cy="7.15" r="0.85" fill="var(--bg)" />
      <circle cx="16" cy="15.3" r="2.5" fill="currentColor" />
      <path d="M14.7 17.3h2.6l.75 4.9h-4.1z" fill="currentColor" />
    </svg>
  );
}

export function CommunityLogo({ size = 40 }: { size?: number }) {
  const c = useStore((s) => s.community);
  if (c?.appearance.logoFileId) return <img src="/api/public/logo" alt={c.communityName} width={size} height={size} className="rounded-xl object-cover" style={{ width: size, height: size }} />;
  return (
    <span className="flex items-center justify-center rounded-xl bg-accent-soft text-accent" style={{ width: size, height: size }}>
      <Mark size={size * 0.62} />
    </span>
  );
}
