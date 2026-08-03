import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from "remotion";
import type { ResolvedCaption } from "./resolveDurations";

const CaptionBanner: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 64, opacity }}>
      <div
        style={{
          fontFamily: "sans-serif",
          fontSize: 34,
          fontWeight: 600,
          color: "#ffffff",
          backgroundColor: "rgba(0,0,0,0.6)",
          padding: "16px 32px",
          borderRadius: 12,
          maxWidth: "80%",
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// 큐 사이에 빈 구간이 있을 수 있어(다음 자막까지 대기) Series가 아니라 개별 Sequence로 배치한다.
export const CaptionTrack: React.FC<{ captions: ResolvedCaption[] }> = ({ captions }) => (
  <>
    {captions.map((c, i) => (
      <Sequence key={i} from={c.fromFrame} durationInFrames={c.durationInFrames} layout="none">
        <CaptionBanner text={c.textKo} />
      </Sequence>
    ))}
  </>
);
