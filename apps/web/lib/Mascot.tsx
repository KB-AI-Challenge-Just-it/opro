/** 부엉이 탐색가 — 이 서비스의 마스코트.
 *
 * 래스터 이미지(2.3MB PNG) 대신 인라인 SVG 로 두는 이유:
 *   ① 색이 팔레트 토큰(C)을 그대로 따라간다 — theme.ts 만 바꾸면 캐릭터도 같이 바뀐다
 *   ② 4KB 남짓이라 히어로 로딩이 가볍다(2코어 서버에서 체감된다)
 *   ③ 해상도와 무관하게 선명하다
 *
 * 한쪽 눈동자가 돋보기 렌즈에 확대돼 보이는 것이 이 캐릭터의 시그니처다 —
 * 오른쪽 눈 pupil 반지름(16)이 왼쪽(11)보다 큰 건 의도된 것이니 "맞추지" 말 것.
 */
import { C } from "./theme";

type Props = {
  /** CSS 길이. 기본은 컨테이너 폭에 맞춘다. */
  width?: number | string;
  /** 장식용으로 쓸 때(옆에 같은 뜻의 텍스트가 있을 때) 스크린리더에서 숨긴다. */
  decorative?: boolean;
  className?: string;
};

export function Mascot({ width = "100%", decorative = false, className }: Props) {
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": "돋보기를 든 부엉이가 정책공고를 살펴보는 일러스트" } as const);

  return (
    <svg
      viewBox="0 0 240 215"
      width={width}
      /* height 는 속성으로 주지 않는다 — SVG 의 height 속성은 길이만 받아서
         "auto" 를 넣으면 콘솔 에러가 난다. 비율 유지는 CSS 로 처리한다. */
      className={className}
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
      {...a11y}
    >
      {/* 뒤쪽 공고 카드 — 왼쪽은 일반, 오른쪽은 매칭 성공(세컨더리 + 체크) */}
      <g transform="rotate(-13 36 130)">
        <rect x="10" y="99" width="50" height="64" rx="7" fill={C.white} stroke={C.border} strokeWidth="2" />
        <rect x="19" y="111" width="32" height="4" rx="2" fill={C.border} />
        <rect x="19" y="123" width="24" height="4" rx="2" fill={C.border} />
        <rect x="19" y="135" width="29" height="4" rx="2" fill={C.border} />
      </g>
      <g transform="rotate(12 205 122)">
        <rect x="180" y="90" width="50" height="64" rx="7" fill={C.white} stroke={C.secondary} strokeWidth="2.5" />
        <rect x="189" y="102" width="32" height="4" rx="2" fill={C.border} />
        <rect x="189" y="114" width="22" height="4" rx="2" fill={C.border} />
        <circle cx="205" cy="136" r="11" fill={C.secondary} />
        <path d="M200 136.5 l3.6 3.6 l6.4 -7" fill="none" stroke={C.white} strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* 귀깃 */}
      <path d="M74 70 L64 38 L96 57 Z" fill={C.primaryDark} />
      <path d="M146 70 L156 38 L124 57 Z" fill={C.primaryDark} />

      {/* 몸통 · 배 */}
      <path d="M110 46 C152 46 178 82 178 124 C178 160 149 182 110 182
               C71 182 42 160 42 124 C42 82 68 46 110 46 Z" fill={C.primary} />
      <ellipse cx="110" cy="140" rx="45" ry="40" fill={C.bgPage} />

      {/* 날개 */}
      <path d="M46 118 C35 137 39 163 56 171 C61 154 53 131 60 120 Z" fill={C.primaryDark} />
      <path d="M174 118 C185 135 181 159 166 169 C160 152 167 131 160 120 Z" fill={C.primaryDark} />

      {/* 눈 — 오른쪽 눈동자는 돋보기에 확대된 상태 */}
      <circle cx="84" cy="102" r="25" fill={C.bgPage} />
      <circle cx="136" cy="102" r="25" fill={C.bgPage} />
      <circle cx="84" cy="105" r="11" fill={C.ink} />
      <circle cx="136" cy="104" r="16" fill={C.ink} />
      <circle cx="88" cy="101" r="3.4" fill={C.white} />
      <circle cx="141" cy="99" r="4.6" fill={C.white} />

      {/* 부리 · 발 */}
      <path d="M110 122 L118 137 L102 137 Z" fill={C.secondary} strokeLinejoin="round" />
      <ellipse cx="92" cy="184" rx="12" ry="6" fill={C.secondary} />
      <ellipse cx="128" cy="184" rx="12" ry="6" fill={C.secondary} />

      {/* 돋보기 */}
      <circle cx="136" cy="102" r="33" fill={C.primarySoft} fillOpacity="0.28"
              stroke={C.ink} strokeWidth="7" />
      <line x1="159" y1="126" x2="180" y2="149" stroke={C.ink} strokeWidth="11" strokeLinecap="round" />
      <line x1="127" y1="82" x2="146" y2="82" stroke={C.white} strokeWidth="5"
            strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

/** 헤더 로고용 축약형 — 얼굴만. 34px 같은 작은 크기에서 몸통·카드는 뭉개져 안 읽힌다. */
export function MascotMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className}
         aria-hidden="true" style={{ display: "block" }}>
      <path d="M28 40 L21 12 L50 30 Z" fill={C.primaryDark} />
      <path d="M92 40 L99 12 L70 30 Z" fill={C.primaryDark} />
      <circle cx="60" cy="66" r="46" fill={C.primary} />
      {/* 눈 흰자는 bgPage(#F7F5F0)가 아니라 순백을 쓴다 — 헤더 배경이 bgPage 반투명이라
          같은 색을 쓰면 34px 크기에서 눈이 아니라 "뚫린 구멍"으로 읽힌다. */}
      <circle cx="42" cy="58" r="17" fill={C.white} />
      <circle cx="78" cy="58" r="17" fill={C.white} />
      <circle cx="42" cy="60" r="7.5" fill={C.ink} />
      <circle cx="78" cy="60" r="7.5" fill={C.ink} />
      <circle cx="45" cy="56" r="2.4" fill={C.white} />
      <circle cx="81" cy="56" r="2.4" fill={C.white} />
      <path d="M60 74 L66 86 L54 86 Z" fill={C.secondary} />
    </svg>
  );
}
