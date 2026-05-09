export function AipHero() {
  return (
    <svg viewBox="0 0 800 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AIP applications">
      <defs>
        <linearGradient id="aip-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7f8fa" />
          <stop offset="100%" stopColor="#e8edf3" />
        </linearGradient>
        <linearGradient id="aip-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eef1f5" />
        </linearGradient>
        <linearGradient id="aip-accent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7e57c2" />
          <stop offset="100%" stopColor="#5e35b1" />
        </linearGradient>
        <linearGradient id="aip-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="800" height="240" fill="url(#aip-bg)" />

      {/* Faint dotted grid */}
      <g fill="#cbd3dc" opacity="0.55">
        {Array.from({ length: 18 }).map((_, row) =>
          Array.from({ length: 36 }).map((_, col) => {
            const x = col * 24 + 12;
            const y = row * 14 + 8;
            const offsetX = (row % 2) * 12;
            return <circle key={`d-${row}-${col}`} cx={x + offsetX} cy={y} r="0.7" />;
          }),
        )}
      </g>

      {/* Isometric grid of "app" tiles */}
      <g transform="translate(400 120)">
        {(() => {
          const tiles = [];
          const TILE_W = 50;
          const TILE_H = 28;
          for (let row = -2; row <= 2; row++) {
            for (let col = -3; col <= 3; col++) {
              const cx = (col - row) * (TILE_W / 2);
              const cy = (col + row) * (TILE_H / 2);
              const isCenter = row === 0 && col === 0;
              const isAccent = (row === -1 && col === -2) || (row === 1 && col === 2) || (row === -2 && col === 1);
              tiles.push(
                <g key={`t-${row}-${col}`} transform={`translate(${cx} ${cy})`}>
                  <polygon
                    points={`0,${-TILE_H / 2} ${TILE_W / 2},0 0,${TILE_H / 2} ${-TILE_W / 2},0`}
                    fill={isCenter ? 'url(#aip-accent)' : 'url(#aip-card)'}
                    stroke={isCenter ? '#5e35b1' : '#cbd3dc'}
                    strokeWidth="1"
                  />
                  {/* Side faces for depth */}
                  <polygon
                    points={`${-TILE_W / 2},0 0,${TILE_H / 2} 0,${TILE_H / 2 + 6} ${-TILE_W / 2},6`}
                    fill={isCenter ? '#4527a0' : '#cfd6dd'}
                  />
                  <polygon
                    points={`0,${TILE_H / 2} ${TILE_W / 2},0 ${TILE_W / 2},6 0,${TILE_H / 2 + 6}`}
                    fill={isCenter ? '#5e35b1' : '#dde2e8'}
                  />
                  {isAccent && (
                    <circle cx="0" cy="-2" r="3" fill="#7e57c2" opacity="0.85" />
                  )}
                  {isCenter && (
                    <text x="0" y="3" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ffffff" fontFamily="Arial">
                      AIP
                    </text>
                  )}
                </g>,
              );
            }
          }
          return tiles;
        })()}

        {/* Glow above center tile */}
        <ellipse cx="0" cy="-22" rx="18" ry="6" fill="url(#aip-glow)" />
      </g>

      {/* Floating connection nodes */}
      <g fill="#7e57c2">
        <circle cx="180" cy="60" r="3" />
        <circle cx="640" cy="80" r="3" />
        <circle cx="120" cy="170" r="3" />
        <circle cx="690" cy="180" r="3" />
      </g>
      <g stroke="#cbb6f0" strokeWidth="1" fill="none" opacity="0.7">
        <path d="M180 60 Q 280 80 360 110" />
        <path d="M640 80 Q 540 90 460 115" />
        <path d="M120 170 Q 230 160 350 135" />
        <path d="M690 180 Q 560 170 470 140" />
      </g>
    </svg>
  );
}
