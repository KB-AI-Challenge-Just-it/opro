// doc/test_scenario.md의 "2. 시연 순서" 표를 그대로 옮긴 편집 설계도.
// 실제 녹화본이 준비되면 public/clips/ 아래 정확히 이 file 이름으로 mp4를 넣으면 된다.
// 녹화본이 아직 없는 파일은 Studio에서 회색 placeholder로 표시되고,
// estimatedSeconds(= 원본 표의 "예상(분)" 값)만큼 자리를 차지한다.

// 클립 안에서 배속을 다르게 줄 구간. fromSec/toSec은 "원본 파일" 기준 초, rate=1이 원속.
// toSec을 생략하면 클립 끝까지. 구간들은 fromSec 오름차순으로 이어붙여 빈틈이 없어야 한다.
// zoom은 이 구간 동안 화면을 몇 배 확대할지(중앙 기준 크롭) — 생략하면 확대 없음(1배).
export type SpeedSegment = { fromSec: number; toSec?: number; rate: number; zoom?: number };

// 타이밍 자막 큐. fromSec/toSec은 "편집이 끝난 뒤의 화면(출력 타임라인)" 기준 초다 —
// speedSegments로 배속·점프컷을 적용한 뒤 실제로 보이는 시간축과 맞춰야 하므로,
// 원본 파일 초가 아니라 이 클립이 최종적으로 재생되는 길이(0초부터) 기준으로 적는다.
export type CaptionCue = { textKo: string; fromSec: number; toSec: number };

export type ClipScene = {
  id: string;
  kind: "clip";
  file: string; // public/clips/<file>
  captionKo: string; // captions가 없을 때 쓰는 통짜 하단 자막(화면에서 보여줄 포인트 요약)
  estimatedSeconds: number; // 녹화본이 없을 때 쓰는 자리 길이(=원본 표 "예상(분)"×60)
  speedSegments?: SpeedSegment[]; // 없으면 전체 구간 1배속(기존과 동일)
  captions?: CaptionCue[]; // 있으면 captionKo 대신 이 타이밍 자막들을 순서대로 표시
};

export type TitleScene = {
  id: string;
  kind: "title";
  titleKo: string;
  subtitleKo?: string;
  durationSeconds: number;
};

export type ImageScene = {
  id: string;
  kind: "image";
  file: string; // public/clips/<file> (영상과 같은 폴더에 둔다)
  captionKo: string;
  durationSeconds: number; // 정지 사진이라 직접 노출 시간을 정함
};

export type ExplainerScene = {
  id: string;
  kind: "explainer";
  headingKo: string; // 상단 작은 라벨
  introKo: string; // 상황 설명 문장(왜 이 시연이 필요한지)
  factsKo: { label: string; value: string }[]; // 제목/배경/대상/지원분야/마감 등 사실 나열
  durationSeconds: number;
};

export type Scene = ClipScene | TitleScene | ImageScene | ExplainerScene;

export const SCENES: Scene[] = [
  {
    id: "intro",
    kind: "title",
    titleKo: "소상공인 금융 지원 에이전트",
    subtitleKo: "온보딩 → 진단 → 매칭 → 리포트 → 초안 → 알림, 끝까지 이어지는 시연",
    durationSeconds: 3,
  },
  {
    id: "case1-title",
    kind: "title",
    titleKo: "1부 - Opro 메인 기능 소상공인 공고 추천 및 초안 작성",
    subtitleKo: "서울 마포구 카페 사장님",
    durationSeconds: 2.5,
  },
  {
    id: "case1-full",
    kind: "clip",
    file: "case1.mov",
    captionKo: "랜딩 → 온보딩 → 진단 → 재질문 → 리포트 → 초안 → 알림",
    estimatedSeconds: 480, // 실제 파일 길이로 자동 대체됨(자리 길이일 뿐)
    // 로딩 대기 구간 점프컷 + 3:05.06부터는 case1.mov 실제 끝까지 그대로 재생
    speedSegments: [
      // 전체 영상 기준 08.08초에 확대가 시작되게: 앞에 intro(3s)+case1-title(2.5s)=5.5초가
      // 먼저 재생되므로, case1.mov 자체 기준으로는 8.08-5.5=2.58초 지점부터 시작해야 한다.
      { fromSec: 0, toSec: 2.58, rate: 1 }, // 0:00 ~ 0:02.58 (원속)
      // 전체 영상 기준 57.11초에 확대가 풀리게: 확대 시작(절대 08.08초)부터 출력 49.03초가
      // 지나야 하므로, 1.5배속 소스로는 49.03*1.5=73.545초 재생 → 2.58+73.545=76.125초까지.
      // 전체 영상 기준 00:16.05~00:16.13 구간 추가 삭제: 소스 14.535~14.655초를 점프컷으로 건너뜀
      { fromSec: 2.58, toSec: 14.535, rate: 1.5, zoom: 1.4 },
      { fromSec: 14.655, toSec: 14.73, rate: 1.5, zoom: 1.4 },
      // 전체 영상 기준 00:16.18~00:17.14 구간 삭제: 소스 14.73~16.17초를 점프컷으로 건너뜀
      { fromSec: 16.17, toSec: 76.125, rate: 1.5, zoom: 1.4 }, // 0:02.58 ~ 1:16.125 — 1.5배속 + 확대
      // 전체 영상 기준 00:57.04~01:13.18(정지에 가까운 화면) 구간을 5초로 압축:
      // 소스 16.07초(95.12~111.19)를 3.214배속(16.07/5)으로 재생.
      { fromSec: 95.12, toSec: 111.19, rate: 3.214 },
      // 전체 영상 기준 01:01.10~01:20.15 구간 1.5배속: 소스 111.19~130.27초를 1.5배속 재생
      { fromSec: 111.19, toSec: 130.27, rate: 1.5 },
      { fromSec: 130.27, toSec: 143.08, rate: 1 }, // 원속 재개 ~ 대기2 시작(2:23.08)
      { fromSec: 143.08, toSec: 145.08, rate: 1 }, // 대기2 앞 2초만: 2:23.08 ~ 2:25.08
      // 전체 영상 기준 02:27.16~02:29.10 구간 삭제: 소스 243.62~245.56초를 점프컷으로 건너뜀
      { fromSec: 185.06, toSec: 243.62, rate: 1 }, // 3:05.06부터 원속 재생
      { fromSec: 245.56, rate: 1 }, // 삭제 구간 이후 case1.mov 실제 끝(약 4:05.80)까지 재생
    ],
    // 초안 — 실제 화면을 보지 못한 상태로 원래 단계 순서(test_scenario.md 1~10번)만 근거로
    // 편집 후 타임라인에 맞춰 추정한 것. 타이밍·문구 둘 다 확인 후 고쳐야 한다.
    captions: [
      // fromSec/toSec은 case1-full 자체 기준(상대) 초. 전체 영상 기준으로 맞추려면
      // 앞의 intro(3s)+case1-title(2.5s)=5.5초를 빼야 한다 — 예: 전체 18.28초 → 12.78초.
      { textKo: "먼저 회원가입을 진행한 뒤, 대시보드로 이동합니다.", fromSec: 0, toSec: 5.78 },
      { textKo: "온보딩 질문지 8문항에 순서대로 답변합니다.", fromSec: 12.78, toSec: 17.6 },
      { textKo: "콜1 진단이 진행되는 동안 잠시 기다립니다.", fromSec: 45.6, toSec: 51.61 },
      { textKo: "진단 결과를 확인하고, 재질문에 답변한 뒤 카카오 알림 수신에 동의합니다.", fromSec: 51.61, toSec: 53.21 },
      { textKo: "콜2 리포트가 생성되는 동안 잠시 기다립니다.", fromSec: 73.65, toSec: 76.65 },
      { textKo: "리포트가 완성되고, 알림 벨이 도착합니다.", fromSec: 82.68, toSec: 85.68 },
      // 전체 영상 기준 02:04.10(124.10s) → 118.6초(=124.10-5.5)부터 3초간 노출
      { textKo: "추천 공고에 대한 초안 작성을 수행합니다.", fromSec: 100.55, toSec: 103.8 },
      { textKo: "이전의 질문은 질문 목록 보기를 통해 조회할 수 있습니다.", fromSec: 120.56, toSec: 123.8 },
    ],
  },
  {
    id: "case1-kakao",
    kind: "image",
    file: "case1_result.png",
    captionKo: "매칭 완료 → 카카오톡 알림 도착",
    durationSeconds: 4.5,
  },
  {
    id: "case2-title",
    kind: "title",
    titleKo: "2부 - 신규 공고 능동 알림",
    subtitleKo: "새 정책자금 공고가 올라오면, 사용자는 아무것도 안 해도 알림이 온다",
    durationSeconds: 2.5,
  },
  {
    id: "case2-context",
    kind: "explainer",
    headingKo: "시연 전제",
    introKo:
      "실제 환경에서는 기업마당에 공고를 직접 등록할 수 없기 때문에, 아래와 같은 공고가 새로 올라왔고 \n" +
      "사용자가 알림을 8시 10분에 받도록 설정한 상황으로 가정하고 동작을 보여드리겠습니다.",
    factsKo: [
      { label: "제목", value: "[서울] 영등포구 외식업 소상공인 경영안정자금 특별지원" },
      { label: "배경", value: "원자재비·공공요금 상승으로 인한 외식업 운영자금 부담 완화" },
      { label: "대상", value: "서울 영등포구 소재 음식점/외식업 소상공인" },
      { label: "지원분야", value: "운영자금" },
      { label: "마감", value: "오늘로부터 30일 뒤" },
    ],
    durationSeconds: 8,
  },
  {
    id: "case2-part1",
    kind: "clip",
    file: "case2_1.mov",
    captionKo: "DB에 신규 공고 등록 + 알림 시각(8:10) 설정",
    estimatedSeconds: 60, // 실제 파일 길이로 자동 대체됨(자리 길이일 뿐)
    // 실제 파일 길이 29.40초. 전체 영상 기준 2:04.25~2:32.07 구간이 이 클립 자체 기준
    // 1.42초~29.24초에 해당해(앞의 intro~case2-context 누적 122.83초를 뺀 값) 1.5배속 처리.
    speedSegments: [
      { fromSec: 0, toSec: 1.42, rate: 1 },
      { fromSec: 1.42, toSec: 29.24, rate: 1.5 },
      { fromSec: 29.24, toSec: 29.4, rate: 1 },
    ],
    // 초안 — 아직 실제 길이·타이밍 확인 전이라 클립 전체(0~60초, estimatedSeconds와 동일)에
    // 한 줄로만 걸어뒀다. 실제 재생 길이 알려주면 정확한 구간으로 다시 나누겠다.
    captions: [
      { textKo: "신규 정책자금 공고를 데이터베이스에 등록하고, 알림 시각을 8시 10분으로 설정합니다.", fromSec: 0, toSec: 5 },
    ],
  },
  {
    id: "case2-part2",
    kind: "clip",
    file: "case2_2.mov",
    captionKo: "8시 10분 — 스케줄러 자동 실행 → 매칭 · 알림 발송",
    estimatedSeconds: 60, // 실제 파일 길이로 자동 대체됨(자리 길이일 뿐)
    speedSegments: [{ fromSec: 0, toSec: 2, rate: 1 }], // 전체를 앞 2초로 점프컷(다 대기 화면이라 통짜로 자름)
    // 이 클립은 2초로 고정 컷되므로 자막도 정확히 그 2초 전체에 맞춘다.
    captions: [
      { textKo: "8시 10분, 스케줄러가 자동으로 실행되어 매칭과 알림이 발송됩니다.", fromSec: 0, toSec: 2 },
    ],
  },
  {
    id: "case2-kakao",
    kind: "image",
    file: "case2_result.jpg",
    captionKo: "카카오톡 알림 도착",
    durationSeconds: 4.5,
  },
  {
    id: "outro",
    kind: "title",
    titleKo: "감사합니다",
    durationSeconds: 2,
  },
];
