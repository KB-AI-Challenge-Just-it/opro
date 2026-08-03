import { Audio } from "@remotion/media";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import { TitleCard } from "./scenes/TitleCard";
import { ClipScene } from "./scenes/ClipScene";
import { ImageScene } from "./scenes/ImageScene";
import { ExplainerScene } from "./scenes/ExplainerScene";
import type { ResolvedScene } from "./scenes/resolveDurations";

export const DemoVideo: React.FC<{ scenes: ResolvedScene[] }> = ({
  scenes,
}) => {
  const { fps } = useVideoConfig();
  let cursor = 0;
  return (
    <>
      {/* 배경음악 — 음악 처음부터, 컴포지션 길이만큼만 자동으로 재생(그 이상은 렌더되지 않음) */}
      <Audio src={staticFile("music.mp3")} volume={0.5} />
      {scenes.map((scene) => {
        const from = cursor;
        cursor += scene.durationInFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={scene.durationInFrames} premountFor={fps}>
            {scene.kind === "title" ? (
              <TitleCard titleKo={scene.titleKo} subtitleKo={scene.subtitleKo} />
            ) : scene.kind === "image" ? (
              <ImageScene file={scene.file} captionKo={scene.captionKo} />
            ) : scene.kind === "explainer" ? (
              <ExplainerScene
                headingKo={scene.headingKo}
                introKo={scene.introKo}
                factsKo={scene.factsKo}
              />
            ) : (
              <ClipScene
                file={scene.file}
                captionKo={scene.captionKo}
                footageMissing={scene.footageMissing}
                segments={scene.resolvedSegments}
                captions={scene.resolvedCaptions}
              />
            )}
          </Sequence>
        );
      })}
    </>
  );
};
