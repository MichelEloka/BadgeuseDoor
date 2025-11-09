export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  const s = `${size}px`;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" fill="none" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" />
    </svg>
  );
}

