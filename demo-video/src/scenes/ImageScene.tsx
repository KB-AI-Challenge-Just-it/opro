import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

export const ImageScene: React.FC<{ file: string; captionKo: string }> = ({ file, captionKo }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", justifyContent: "center", alignItems: "center", opacity }}>
      <Img
        src={staticFile(`clips/${file}`)}
        style={{ maxWidth: "70%", maxHeight: "80%", objectFit: "contain", borderRadius: 12 }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 64,
          fontFamily: "sans-serif",
          fontSize: 34,
          fontWeight: 600,
          color: "#ffffff",
          backgroundColor: "rgba(0,0,0,0.6)",
          padding: "16px 32px",
          borderRadius: 12,
        }}
      >
        {captionKo}
      </div>
    </AbsoluteFill>
  );
};
