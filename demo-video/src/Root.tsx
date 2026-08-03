import "./index.css";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { DemoVideo } from "./DemoVideo";
import { resolveScenes, type ResolvedScene } from "./scenes/resolveDurations";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

type Props = { scenes: ResolvedScene[] };

const calculateMetadata: CalculateMetadataFunction<Props> = async () => {
  const scenes = await resolveScenes(FPS);
  const durationInFrames = scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
  return { durationInFrames, props: { scenes } };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DemoVideo"
        component={DemoVideo}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={FPS * 60} // 실제 값은 calculateMetadata가 녹화본 길이로 덮어씀
        defaultProps={{ scenes: [] }}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};
