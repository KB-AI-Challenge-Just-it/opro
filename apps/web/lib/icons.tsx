/** 이모지 대신 쓰는 공용 라인 아이콘 모음 — 여러 페이지에서 같은 아이콘을 중복 정의하지 않도록 모아둔다. */

export function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 4v-4H6a2 2 0 0 1-2-2V5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function FormIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MatchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14.5 14.5 20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ReportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M5 4h14v16H5V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function DocCheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 13.5l2.2 2.2L16 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BellIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M6 10a6 6 0 0 1 12 0v4l1.6 2.8a1 1 0 0 1-.87 1.5H5.27a1 1 0 0 1-.87-1.5L6 14v-4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10 20.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** 로그인/회원가입 야경 컨셉의 브랜드 마스코트 — '정책자금을 찾아주는 탐정'. 골드/브라운 톤으로 통일해 다른 페이지의 팔레트와 이어진다. */
export function DetectiveMascot({ size = 200 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 200 220" fill="none">
      <ellipse cx="100" cy="205" rx="60" ry="10" fill="#000" opacity="0.18" />
      <path d="M62 150c-6 20-4 40 4 52h68c8-12 10-32 4-52" fill="#5B4630" />
      <path d="M62 150c-6 20-4 40 4 52h68c8-12 10-32 4-52" stroke="#3E2E1E" strokeWidth="2" />
      <circle cx="100" cy="112" r="46" fill="#FFF8E8" />
      <path
        d="M56 100c-10-4-16-16-10-28 8 6 16 8 22 8"
        fill="#FFF8E8"
        stroke="#3E2E1E"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M144 100c10-4 16-16 10-28-8 6-16 8-22 8"
        fill="#FFF8E8"
        stroke="#3E2E1E"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M54 96c6-30 26-50 46-50s40 20 46 50c-14-10-30-14-46-14s-32 4-46 14Z"
        fill="#5B4630"
      />
      <circle cx="82" cy="114" r="4.5" fill="#3E2E1E" />
      <circle cx="118" cy="114" r="4.5" fill="#3E2E1E" />
      <ellipse cx="70" cy="122" rx="7" ry="5" fill="#F5C518" opacity="0.55" />
      <ellipse cx="130" cy="122" rx="7" ry="5" fill="#F5C518" opacity="0.55" />
      <path d="M92 126c3 3 13 3 16 0" stroke="#3E2E1E" strokeWidth="2" strokeLinecap="round" />
      <circle cx="100" cy="119" r="2.6" fill="#3E2E1E" />
      <circle cx="130" cy="150" r="18" fill="none" stroke="#3E2E1E" strokeWidth="4" />
      <circle cx="130" cy="150" r="18" fill="rgba(255,255,255,0.35)" />
      <path d="M143 163l10 10" stroke="#3E2E1E" strokeWidth="5" strokeLinecap="round" />
      <path d="M70 150c-6 6-8 16-4 24" stroke="#3E2E1E" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** 로그인/회원가입 배경의 야경 실루엣 — 창문 불빛과 가로등으로 온보딩 카드가 그 위에 뜨는 느낌을 준다. */
export function NightCityscape({ width = 480, height = 220 }: { width?: number; height?: number }) {
  const buildings = [
    { x: 0, w: 70, h: 140 },
    { x: 66, w: 46, h: 190 },
    { x: 108, w: 60, h: 120 },
    { x: 164, w: 50, h: 170 },
    { x: 210, w: 70, h: 100 },
    { x: 276, w: 54, h: 160 },
    { x: 326, w: 60, h: 130 },
    { x: 382, w: 46, h: 185 },
    { x: 424, w: 56, h: 110 },
  ];
  return (
    <svg width={width} height={height} viewBox={`0 0 480 220`} preserveAspectRatio="xMidYMax slice">
      <circle cx="60" cy="40" r="1.4" fill="#FFF3C4" opacity="0.8" />
      <circle cx="140" cy="24" r="1" fill="#FFF3C4" opacity="0.6" />
      <circle cx="220" cy="50" r="1.3" fill="#FFF3C4" opacity="0.7" />
      <circle cx="310" cy="20" r="1" fill="#FFF3C4" opacity="0.6" />
      <circle cx="400" cy="42" r="1.4" fill="#FFF3C4" opacity="0.8" />
      <circle cx="440" cy="70" r="30" fill="#FFF3C4" opacity="0.9" />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={height - b.h} width={b.w} height={b.h} fill="#232F4E" />
          {Array.from({ length: Math.floor(b.h / 26) }).map((_, row) =>
            Array.from({ length: Math.max(1, Math.floor(b.w / 18)) }).map((_, col) => {
              const lit = (i + row + col) % 3 !== 0;
              return (
                <rect
                  key={`${row}-${col}`}
                  x={b.x + 8 + col * 18}
                  y={height - b.h + 10 + row * 26}
                  width={8}
                  height={11}
                  fill={lit ? "#F5C518" : "#0C1120"}
                  opacity={lit ? 0.85 : 0.5}
                />
              );
            })
          )}
        </g>
      ))}
    </svg>
  );
}

/** 정책자금 안내 도우미 캐릭터 이름 — 마스코트 대사/문구에서 재사용한다. */
export const MASCOT_NAME = "토리";

/** 랜턴을 든 작은 동행 캐릭터 — 메인 탐정 마스코트 옆에서 야경 신을 채운다. */
function LanternCompanion({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="112" rx="34" ry="8" fill="#000" opacity="0.2" />
      <path d="M-26 55c-6 20-4 42 3 57h46c7-15 9-37 3-57" fill="#6FA05A" />
      <path d="M-30 20c0-16 13-29 30-29s30 13 30 29c-10-6-20-9-30-9s-20 3-30 9Z" fill="#6FA05A" />
      <circle cx="0" cy="34" r="26" fill="#FFF8E8" />
      <circle cx="-9" cy="36" r="3.6" fill="#3E2E1E" />
      <circle cx="9" cy="36" r="3.6" fill="#3E2E1E" />
      <path d="M-4 44c2 2 6 2 8 0" stroke="#3E2E1E" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M0 40 -5 47h10Z" fill="#F5C518" />
      <rect x="-8" y="65" width="16" height="20" rx="4" fill="#3E2E1E" opacity="0.85" />
      <path d="M20 70 L34 60 L34 100 L20 92Z" fill="#3E2E1E" />
      <rect x="22" y="66" width="10" height="14" rx="1.5" fill="#F5C518" opacity="0.85" />
      <path d="M27 58v-8" stroke="#3E2E1E" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

/** KB 배너 참고 이미지의 구도(야경 + 시계탑 + 가로등 + 탐정 듀오)를 우리 브랜드 톤(골드/브라운)으로 재해석한 오리지널 일러스트. */
export function PolicyFundNightScene({ width = 760, height = 540 }: { width?: number; height?: number }) {
  const buildings = [
    { x: -40, w: 130, h: 320, roof: true },
    { x: 90, w: 90, h: 400 },
    { x: 560, w: 90, h: 380 },
    { x: 650, w: 150, h: 300, roof: true },
  ];
  return (
    <svg width={width} height={height} viewBox="0 0 760 540" fill="none">
      <defs>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF3C4" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FFF3C4" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="620" cy="90" r="90" fill="url(#moonGlow)" />
      <circle cx="620" cy="90" r="34" fill="#FFF3C4" />
      {[
        [120, 60], [220, 40], [340, 70], [480, 35], [90, 140], [700, 160],
      ].map(([sx, sy], i) => (
        <circle key={i} cx={sx} cy={sy} r={i % 2 === 0 ? 2 : 1.3} fill="#FFF3C4" opacity="0.8" />
      ))}

      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={height - b.h} width={b.w} height={b.h} fill="#232F4E" />
          {b.roof && <path d={`M${b.x} ${height - b.h} L${b.x + b.w / 2} ${height - b.h - 46} L${b.x + b.w} ${height - b.h}Z`} fill="#1B2540" />}
          {Array.from({ length: Math.floor(b.h / 34) }).map((_, row) =>
            Array.from({ length: Math.max(1, Math.floor(b.w / 30)) }).map((_, col) => {
              const lit = (i + row + col) % 3 !== 0;
              return (
                <rect
                  key={`${row}-${col}`}
                  x={b.x + 14 + col * 30}
                  y={height - b.h + 18 + row * 34}
                  width={13}
                  height={18}
                  rx={2}
                  fill={lit ? "#F5C518" : "#141B2E"}
                  opacity={lit ? 0.85 : 0.5}
                />
              );
            })
          )}
        </g>
      ))}

      {/* 시계탑 */}
      <g>
        <rect x="330" y="120" width="70" height="300" fill="#2B3A63" />
        <rect x="322" y="90" width="86" height="40" fill="#2B3A63" />
        <path d="M322 90 L365 40 L408 90Z" fill="#232F4E" />
        <circle cx="365" cy="108" r="22" fill="#FFF3C4" stroke="#141B2E" strokeWidth="3" />
        <path d="M365 108 L365 96M365 108 L375 112" stroke="#3E2E1E" strokeWidth="2.4" strokeLinecap="round" />
        {Array.from({ length: 9 }).map((_, row) =>
          Array.from({ length: 2 }).map((_, col) => (
            <rect
              key={`${row}-${col}`}
              x={344 + col * 30}
              y={148 + row * 30}
              width={12}
              height={17}
              rx={2}
              fill={(row + col) % 2 === 0 ? "#F5C518" : "#141B2E"}
              opacity={0.85}
            />
          ))
        )}
      </g>

      {/* 가로등 */}
      {[150, 470].map((lx, i) => (
        <g key={i}>
          <rect x={lx - 3} y="330" width="6" height="130" fill="#141B2E" />
          <circle cx={lx} cy="322" r="16" fill="url(#moonGlow)" />
          <circle cx={lx} cy="322" r="8" fill="#F5C518" opacity="0.9" />
          <path d={`M${lx - 10} 316h20l-4-12h-12Z`} fill="#141B2E" />
        </g>
      ))}

      <rect x="0" y={height - 26} width={width} height="26" fill="#0C1120" opacity="0.5" />

      <LanternCompanion x={230} y={310} scale={1.05} />

      {/* 탐정 마스코트 */}
      <g transform="translate(430 300)">
        <ellipse cx="0" cy="176" rx="76" ry="14" fill="#000" opacity="0.22" />
        <path d="M-58 90c-10 30-8 60 4 86h108c12-26 14-56 4-86" fill="#5B4630" />
        <path d="M-58 90c-10 30-8 60 4 86h108c12-26 14-56 4-86" stroke="#3E2E1E" strokeWidth="2.5" />
        <circle cx="-40" cy="150" r="4" fill="#F5C518" />
        <circle cx="-40" cy="164" r="4" fill="#F5C518" />
        <circle cx="-40" cy="178" r="4" fill="#F5C518" />
        <circle cx="0" cy="18" r="66" fill="#FFF8E8" />
        <path d="M-70 -6c-14-6-22-24-14-42 11 8 22 12 30 12" fill="#FFF8E8" stroke="#3E2E1E" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M70 -6c14-6 22-24 14-42-11 8-22 12-30 12" fill="#FFF8E8" stroke="#3E2E1E" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M-66 -14c8-42 36-70 66-70s58 28 66 70c-20-14-42-20-66-20s-46 6-66 20Z" fill="#5B4630" />
        <path d="M-66 -14c8-42 36-70 66-70s58 28 66 70" fill="none" stroke="#3E2E1E" strokeWidth="2" />
        <circle cx="-24" cy="20" r="6.5" fill="#3E2E1E" />
        <circle cx="24" cy="20" r="6.5" fill="#3E2E1E" />
        <ellipse cx="-42" cy="32" rx="10" ry="7" fill="#F5C518" opacity="0.5" />
        <ellipse cx="42" cy="32" rx="10" ry="7" fill="#F5C518" opacity="0.5" />
        <path d="M-14 40c4 4 24 4 28 0" stroke="#3E2E1E" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="0" cy="28" r="3.6" fill="#3E2E1E" />
        <circle cx="48" cy="70" r="26" fill="none" stroke="#3E2E1E" strokeWidth="6" />
        <circle cx="48" cy="70" r="26" fill="rgba(255,255,255,0.32)" />
        <path d="M67 89l16 16" stroke="#3E2E1E" strokeWidth="7" strokeLinecap="round" />
        <path d="M-56 78c-10 8-14 24-6 38" stroke="#3E2E1E" strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function WarningIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.5 21.5 20H2.5L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 10v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17.2h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
