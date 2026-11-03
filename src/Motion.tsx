import { type ReactNode, useLayoutEffect, useRef } from "react";
import {
  motion,
  useIsPresent,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";

export const ease = [0.22, 1, 0.36, 1] as const;
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, pointerEvents: "none" as const },
  transition: { duration: 0.18, ease },
};

export function Overlay(props: HTMLMotionProps<"div">) {
  const present = useIsPresent();
  return (
    <motion.div
      {...props}
      {...fade}
      inert={!present}
      data-exiting={!present || undefined}
    />
  );
}

export function Reveal({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return (
    <motion.div
      className={className}
      inert={!present}
      id={id}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0, pointerEvents: "none" }}
      transition={{ duration: reduced ? 0 : 0.22, ease }}
      style={{ overflow: "hidden" }}
    >
      {children}
    </motion.div>
  );
}

// Animate the existing surface so editor selection, scroll and canvas cameras survive.
export function useSurfaceMotion(key: string, direction = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || reduced || !element.animate) return;
    const animation = element.animate(
      [
        {
          opacity: 0.25,
          transform: direction
            ? `translateX(${direction * 14}px)`
            : "translateY(7px)",
        },
        { opacity: 1, transform: "translate(0, 0)" },
      ],
      { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    // Canceling a superseded transition is an expected interaction.
    void animation.finished.catch(() => {});
    return () => animation.cancel();
  }, [key, reduced]);
  return ref;
}
