"use client";

import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

export type MotionRevealVariant = "fade-up" | "fade-right" | "fade-left" | "zoom-in" | "fade-in";

type MotionRevealProps = Readonly<{
  children: ReactNode;
  variant?: MotionRevealVariant;
  delayMs?: number;
  durationMs?: number;
  className?: string;
}>;

/**
 * Lightweight scroll reveal (JobUp/AOS-style fade/zoom).
 * Softens motion on narrow viewports and respects prefers-reduced-motion.
 */
export function MotionReveal({
  children,
  variant = "fade-up",
  delayMs = 0,
  durationMs = 700,
  className,
}: MotionRevealProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setVisible(true);
      return;
    }

    const narrow = window.matchMedia("(max-width: 820px)").matches;
    let cancelled = false;

    const reveal = () => {
      if (!cancelled) setVisible(true);
    };

    // Reveal immediately if already in (or near) the viewport on mount.
    const rect = node.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < viewportH * 0.92 && rect.bottom > viewportH * 0.04) {
      reveal();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal();
            observer.disconnect();
            break;
          }
        }
      },
      {
        // Less aggressive clipping on mobile so reveals fire earlier while scrolling.
        rootMargin: narrow ? "0px 0px -4% 0px" : "0px 0px -8% 0px",
        threshold: narrow ? 0.06 : 0.1,
      },
    );

    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  const style = {
    "--home-reveal-delay": `${delayMs}ms`,
    "--home-reveal-duration": `${durationMs}ms`,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className={[
        "home-reveal",
        `home-reveal-${variant}`,
        visible ? "home-reveal-visible" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}

/** @deprecated Prefer MotionReveal; kept for existing home imports. */
export const HomeReveal = MotionReveal;
