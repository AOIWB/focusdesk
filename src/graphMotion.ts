import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

// Retarget from the current frame, never from the start of an entrance animation.
export function approach(current: number, target: number, elapsed: number) {
  const next = target + (current - target) * Math.exp(-elapsed / 55);
  return Math.abs(next - target) < 0.001 ? target : next;
}
export function useGraphMotion<T extends Record<string, number>>(
  target: T,
  immediate = false,
): T {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (immediate || reduced) {
      current.current = target;
      setFrame(target);
      return;
    }
    let request = 0;
    let last = performance.now();
    function tick(now: number) {
      const next = { ...target };
      let moving = false;
      for (const key in target) {
        next[key] = approach(
          current.current[key] ?? target[key],
          target[key],
          now - last,
        ) as T[Extract<keyof T, string>];
        moving ||= next[key] !== target[key];
      }
      last = now;
      current.current = next;
      setFrame(next);
      if (moving) request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [target, immediate, reduced]);
  return immediate || reduced ? target : frame;
}
