import { Input, ALL_FORMATS, UrlSource } from "mediabunny";
import { staticFile } from "remotion";
import { SCENES, type Scene } from "./config";

export type ResolvedSegment = { fromSec: number; toSec: number; rate: number; zoom: number; outputFrames: number };
export type ResolvedCaption = { textKo: string; fromFrame: number; durationInFrames: number };

export type ResolvedScene = Scene & {
  durationInFrames: number;
  footageMissing: boolean; // true면 아직 public/clips/에 해당 mp4가 없다는 뜻
  resolvedSegments?: ResolvedSegment[]; // clip 씬에서 speedSegments가 있을 때만 채워짐
  resolvedCaptions?: ResolvedCaption[]; // clip 씬에서 captions가 있을 때만 채워짐
};

const getClipDurationSeconds = async (file: string): Promise<number | null> => {
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(staticFile(`clips/${file}`), {
        getRetryDelay: () => null,
      }),
    });
    const seconds = await input.computeDuration();
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null; // 녹화본이 아직 없거나 읽을 수 없음 — 자리 길이(estimatedSeconds)로 대체
  }
};

export const resolveScenes = async (fps: number): Promise<ResolvedScene[]> => {
  const resolved = await Promise.all(
    SCENES.map(async (scene): Promise<ResolvedScene> => {
      if (scene.kind === "title" || scene.kind === "image" || scene.kind === "explainer") {
        return {
          ...scene,
          durationInFrames: Math.round(scene.durationSeconds * fps),
          footageMissing: false,
        };
      }

      const actualSeconds = await getClipDurationSeconds(scene.file);
      const seconds = actualSeconds ?? scene.estimatedSeconds;
      const footageMissing = actualSeconds === null;

      // captions는 "편집이 끝난 뒤 화면(출력 타임라인)" 기준 초라 speedSegments 유무와 무관하게
      // 그대로 프레임으로만 환산하면 된다.
      const resolvedCaptions: ResolvedCaption[] | undefined = scene.captions?.map((c) => ({
        textKo: c.textKo,
        fromFrame: Math.round(c.fromSec * fps),
        durationInFrames: Math.max(1, Math.round((c.toSec - c.fromSec) * fps)),
      }));

      if (!scene.speedSegments || scene.speedSegments.length === 0) {
        return {
          ...scene,
          durationInFrames: Math.round(seconds * fps),
          footageMissing,
          resolvedCaptions,
        };
      }

      // 배속 구간이 있으면: 각 구간의 "원본 길이 / rate"를 결과 프레임 수로 환산해 이어붙인다.
      // toSec 생략(마지막 구간) → 클립 실제 끝(seconds)까지로 채운다.
      const resolvedSegments: ResolvedSegment[] = scene.speedSegments.map((seg) => {
        const toSec = seg.toSec ?? seconds;
        const outputFrames = Math.max(1, Math.round(((toSec - seg.fromSec) / seg.rate) * fps));
        return { fromSec: seg.fromSec, toSec, rate: seg.rate, zoom: seg.zoom ?? 1, outputFrames };
      });
      const durationInFrames = resolvedSegments.reduce((sum, s) => sum + s.outputFrames, 0);

      return {
        ...scene,
        durationInFrames,
        footageMissing,
        resolvedSegments,
        resolvedCaptions,
      };
    }),
  );

  return resolved;
};
