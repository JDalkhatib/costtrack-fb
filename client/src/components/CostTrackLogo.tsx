interface CostTrackLogoProps {
  size?: number;
  className?: string;
}

/**
 * CostTrack SVG logo mark — navy rounded square with CT monogram.
 * White C + white T stem, amber T crossbar + amber terminal dot on C.
 * Scales cleanly from 24px to 200px.
 */
export function CostTrackLogo({ size = 32, className = "" }: CostTrackLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CostTrack"
      className={className}
    >
      {/* Navy rounded square */}
      <rect width="200" height="200" rx="44" fill="#0F2D5E" />

      {/* Subtle gradient overlay for depth */}
      <rect width="200" height="200" rx="44" fill="url(#ctGrad)" opacity="0.35" />
      <defs>
        <linearGradient id="ctGrad" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a4b8c" />
          <stop offset="100%" stopColor="#071a38" />
        </linearGradient>
      </defs>

      {/* C — bold white arc */}
      <path
        d="M70 66 Q36 66 36 100 Q36 134 70 134"
        stroke="white"
        strokeWidth="15"
        strokeLinecap="round"
        fill="none"
      />

      {/* T horizontal bar — amber */}
      <line x1="82" y1="66" x2="164" y2="66" stroke="#F59E0B" strokeWidth="15" strokeLinecap="round" />

      {/* T vertical stem — white */}
      <line x1="123" y1="66" x2="123" y2="134" stroke="white" strokeWidth="15" strokeLinecap="round" />

      {/* Amber accent dot — terminal of C's bottom */}
      <circle cx="70" cy="134" r="8" fill="#F59E0B" />
    </svg>
  );
}
