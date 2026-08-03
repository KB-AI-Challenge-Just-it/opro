import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import type { ExplainerScene as ExplainerSceneType } from "./config";

export const ExplainerScene: React.FC<Pick<ExplainerSceneType, "headingKo" | "introKo" | "factsKo">> = ({
  headingKo,
  introKo,
  factsKo,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b1220",
        justifyContent: "center",
        alignItems: "center",
        opacity,
        padding: 96,
      }}
    >
      <div style={{ maxWidth: 1400, width: "100%" }}>
        <div
          style={{
            fontFamily: "sans-serif",
            fontSize: 24,
            fontWeight: 700,
            color: "#eab308",
            letterSpacing: 2,
            marginBottom: 16,
          }}
        >
          {headingKo}
        </div>
        <div
          style={{
            fontFamily: "sans-serif",
            fontSize: 34,
            fontWeight: 600,
            color: "#f8fafc",
            lineHeight: 1.5,
            marginBottom: 40,
            whiteSpace: "pre-line",
          }}
        >
          {introKo}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {factsKo.map((f) => (
            <div key={f.label} style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <div
                style={{
                  fontFamily: "sans-serif",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#94a3b8",
                  flex: "0 0 120px",
                }}
              >
                {f.label}
              </div>
              <div style={{ fontFamily: "sans-serif", fontSize: 26, color: "#e2e8f0" }}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
