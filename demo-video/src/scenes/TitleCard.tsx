import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

export const TitleCard: React.FC<{ titleKo: string; subtitleKo?: string }> = ({
  titleKo,
  subtitleKo,
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
      }}
    >
      <div
        style={{
          fontFamily: "sans-serif",
          fontSize: 72,
          fontWeight: 700,
          color: "#ffffff",
          textAlign: "center",
        }}
      >
        {titleKo}
      </div>
      {subtitleKo ? (
        <div
          style={{
            marginTop: 24,
            fontFamily: "sans-serif",
            fontSize: 32,
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          {subtitleKo}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
