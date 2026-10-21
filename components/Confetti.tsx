"use client";
import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

interface Props {
  trigger: boolean;
  origin?: { x: number; y: number };
}

export default function Confetti({ trigger, origin = { x: 0.5, y: 0.5 } }: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (trigger && !firedRef.current) {
      firedRef.current = true;
      confetti({
        particleCount: 80,
        spread: 70,
        origin,
        colors: ["#3b82f6", "#6366f1", "#facc15", "#22c55e", "#f97316"],
      });
    }
    if (!trigger) {
      firedRef.current = false;
    }
  }, [trigger, origin]);

  return null;
}
