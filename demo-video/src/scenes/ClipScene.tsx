import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ResolvedCaption, ResolvedSegment } from "./resolveDurations";
import { CaptionTrack } from "./CaptionTrack";

const SegmentedVideo: React.FC<{
  file: string;
  segments: ResolvedSegment[];
}> = ({ file, segments }) => {
  const { fps } = useVideoConfig();
  let cursor = 0;
  return (
    <>
      {segments.map((seg, i) => {
        const from = cursor;
        cursor += seg.outputFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={seg.outputFrames} premountFor={fps}>
            <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
              <Video
                src={staticFile(`clips/${file}`)}
                trimBefore={Math.round(seg.fromSec * fps)}
                trimAfter={Math.round(seg.toSec * fps)}
                playbackRate={seg.rate}
                style={{
                  width: "100%",
                  height: "100%",
                  transform: seg.zoom !== 1 ? `scale(${seg.zoom})` : undefined,
                  transformOrigin: "center center",
                }}
                objectFit="contain"
              />
            </div>
          </Sequence>
        );
      })}
    </>
  );
};

export const ClipScene: React.FC<{
  file: string;
  captionKo: string;
  footageMissing: boolean;
  segments?: ResolvedSegment[]; // 있으면 구간별 배속 재생(4배속 대기바 등), 없으면 통짜 원속 재생
  captions?: ResolvedCaption[]; // 있으면 captionKo 대신 이 타이밍 자막들을 순서대로 표시
}> = ({ file, captionKo, footageMissing, segments, captions }) => {
  const frame = useCurrentFrame();
  const captionOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {footageMissing ? (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#1e293b",
          }}
        >
          <div
            style={{
              fontFamily: "sans-serif",
              fontSize: 28,
              color: "#f8fafc",
              textAlign: "center",
            }}
          >
            녹화본 없음 — public/clips/{file}
          </div>
        </AbsoluteFill>
      ) : segments && segments.length > 0 ? (
        <SegmentedVideo file={file} segments={segments} />
      ) : (
        <Video
          src={staticFile(`clips/${file}`)}
          style={{ width: "100%", height: "100%" }}
          objectFit="contain"
          from={-1}
        />
      )}
      {captions && captions.length > 0 ? (
        <CaptionTrack captions={captions} />
      ) : (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 64,
            opacity: captionOpacity,
          }}
        >
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
            {captionKo}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
