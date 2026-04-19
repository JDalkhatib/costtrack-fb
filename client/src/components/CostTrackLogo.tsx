interface CostTrackLogoProps {
  /** Rendered size in px — SVG scales from this */
  size?: number;
  /** Whether to show "COSTTRACK" subtitle (only looks good at 60px+) */
  showSubtitle?: boolean;
  className?: string;
}

/**
 * F&B CostTrack logo mark.
 * Deep forest green rounded square · gold Playfair "F&B" · optional COSTTRACK subtitle.
 * Scales cleanly from 24px to 200px.
 */
export function CostTrackLogo({ size = 32, showSubtitle = false, className = "" }: CostTrackLogoProps) {
  return (
    <>
      {/* Inline Playfair Display font for the logo letterforms */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&display=swap');`}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="F&B CostTrack"
        className={className}
      >
        {/* Forest green rounded square */}
        <rect width="200" height="200" rx="38" fill="#1B4332" />

        {/* Subtle inner gradient for depth */}
        <rect width="200" height="200" rx="38" fill="url(#fbGrad)" opacity="0.3" />
        <defs>
          <linearGradient id="fbGrad" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2d6a4f" />
            <stop offset="100%" stopColor="#0d2b1e" />
          </linearGradient>
        </defs>

        {showSubtitle ? (
          <>
            {/* F&B — large, moved up to make room for subtitle */}
            <text
              x="100"
              y="118"
              textAnchor="middle"
              fontFamily="'Playfair Display', Georgia, serif"
              fontWeight="900"
              fontSize="86"
              fill="#D4AF37"
            >
              F&amp;B
            </text>
            {/* Thin gold divider */}
            <line x1="28" y1="132" x2="172" y2="132" stroke="#D4AF37" strokeWidth="1" opacity="0.4" />
            {/* COSTTRACK subtitle */}
            <text
              x="100"
              y="155"
              textAnchor="middle"
              fontFamily="'Montserrat', 'General Sans', Arial, sans-serif"
              fontWeight="600"
              fontSize="14"
              letterSpacing="4"
              fill="#D4AF37"
              opacity="0.78"
            >
              COSTTRACK
            </text>
          </>
        ) : (
          /* F&B — centered, full height */
          <text
            x="100"
            y="136"
            textAnchor="middle"
            fontFamily="'Playfair Display', Georgia, serif"
            fontWeight="900"
            fontSize="92"
            fill="#D4AF37"
          >
            F&amp;B
          </text>
        )}
      </svg>
    </>
  );
}
