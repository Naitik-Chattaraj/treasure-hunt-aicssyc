// Decorative wooden treasure chest used on the entry and victory screens.
// `open` lifts the lid and shows the gold inside.
export default function TreasureChest({ open = false, className = '' }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 160 140" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="chest-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A86B32" />
          <stop offset="1" stopColor="#6E4119" />
        </linearGradient>
        <linearGradient id="chest-lid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B97A3C" />
          <stop offset="1" stopColor="#7E4C1F" />
        </linearGradient>
        <linearGradient id="chest-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3D27A" />
          <stop offset="1" stopColor="#B07F2A" />
        </linearGradient>
        <radialGradient id="chest-glow" cx="0.5" cy="1" r="0.8">
          <stop offset="0" stopColor="#FFE9A3" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFE9A3" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="80" cy="130" rx="62" ry="7" fill="#3A230F" opacity="0.25" />

      {open && (
        <>
          <ellipse cx="80" cy="62" rx="70" ry="44" fill="url(#chest-glow)" />
          <g fill="#F5C443" stroke="#B07F2A" strokeWidth="1.5">
            <circle cx="56" cy="66" r="8" />
            <circle cx="72" cy="60" r="8" />
            <circle cx="90" cy="62" r="8" />
            <circle cx="106" cy="67" r="8" />
            <circle cx="82" cy="70" r="8" />
          </g>
          <path d="M98 52 l6 -8 l6 8 l-6 6 z" fill="#5FD6BC" stroke="#1E6B5B" strokeWidth="1.5" />
        </>
      )}

      {/* Body */}
      <rect x="22" y="68" width="116" height="58" rx="6" fill="url(#chest-wood)" stroke="#3A230F" strokeWidth="3" />
      <path d="M24 86 H136 M24 106 H136" stroke="#5A3510" strokeWidth="2" opacity="0.6" />

      {/* Lid: closed sits on the body, open tilts back */}
      <g transform={open ? 'translate(0 -30) rotate(-12 80 60)' : undefined}>
        <path
          d="M22 70 V52 C22 30 48 20 80 20 C112 20 138 30 138 52 V70 Z"
          fill="url(#chest-lid)"
          stroke="#3A230F"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M32 44 C44 32 116 32 128 44" stroke="#5A3510" strokeWidth="2" fill="none" opacity="0.6" />
        <path d="M40 23 V70 M120 23 V70" stroke="url(#chest-metal)" strokeWidth="9" />
        <path d="M40 23 V70 M120 23 V70" stroke="#3A230F" strokeWidth="1.5" strokeDasharray="0 12" strokeLinecap="round" />
        <rect x="22" y="64" width="116" height="8" rx="2" fill="url(#chest-metal)" stroke="#3A230F" strokeWidth="2" />
      </g>

      {/* Metal straps on the body */}
      <path d="M40 72 V126 M120 72 V126" stroke="url(#chest-metal)" strokeWidth="9" />
      <path d="M40 72 V126 M120 72 V126" stroke="#3A230F" strokeWidth="1.5" strokeDasharray="0 12" strokeLinecap="round" />

      {/* Lock */}
      <rect x="68" y="70" width="24" height="28" rx="4" fill="url(#chest-metal)" stroke="#3A230F" strokeWidth="2.5" />
      <circle cx="80" cy="81" r="3.5" fill="#3A230F" />
      <path d="M80 83 V91" stroke="#3A230F" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
