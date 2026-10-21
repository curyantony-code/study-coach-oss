"use client";

type Mood = "idle" | "happy" | "thinking" | "celebrate";

interface Props {
  mood?: Mood;
  size?: number;
}

export default function Mascot({ mood = "idle", size = 48 }: Props) {
  const animClass =
    mood === "idle"      ? "mascot-idle" :
    mood === "celebrate" ? "mascot-celebrate" : "";

  const eyeY = mood === "happy" || mood === "celebrate" ? 18 : 20;
  const mouthPath =
    mood === "happy" || mood === "celebrate"
      ? "M 16 28 Q 24 34 32 28"   // smile
      : mood === "thinking"
      ? "M 18 28 Q 24 28 30 28"   // flat
      : "M 16 28 Q 24 34 32 28";  // default smile

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={animClass}
      style={{ display: "inline-block" }}
      aria-hidden="true"
    >
      {/* Body */}
      <ellipse cx="24" cy="32" rx="14" ry="10" fill="#3b82f6" />
      {/* Head */}
      <circle cx="24" cy="20" r="14" fill="#3b82f6" />
      {/* Ears */}
      <ellipse cx="12" cy="9" rx="4" ry="6" fill="#3b82f6" />
      <ellipse cx="36" cy="9" rx="4" ry="6" fill="#3b82f6" />
      <ellipse cx="12" cy="9" rx="2" ry="3.5" fill="#facc15" />
      <ellipse cx="36" cy="9" rx="2" ry="3.5" fill="#facc15" />
      {/* Face */}
      <circle cx="24" cy="22" r="10" fill="#dbeafe" />
      {/* Eyes */}
      <circle cx="20" cy={eyeY} r="2.5" fill="#1e293b" />
      <circle cx="28" cy={eyeY} r="2.5" fill="#1e293b" />
      {/* Eye shine */}
      <circle cx="21" cy={eyeY - 1} r="0.8" fill="white" />
      <circle cx="29" cy={eyeY - 1} r="0.8" fill="white" />
      {/* Nose */}
      <ellipse cx="24" cy="24" rx="1.5" ry="1" fill="#93c5fd" />
      {/* Mouth */}
      <path d={mouthPath} stroke="#1e293b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Wings */}
      <ellipse cx="10" cy="32" rx="5" ry="8" fill="#2563eb" transform="rotate(-15 10 32)" />
      <ellipse cx="38" cy="32" rx="5" ry="8" fill="#2563eb" transform="rotate(15 38 32)" />
      {/* Star badge when celebrating */}
      {mood === "celebrate" && (
        <text x="36" y="10" fontSize="10" textAnchor="middle">⭐</text>
      )}
    </svg>
  );
}
