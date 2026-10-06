"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import styles from "./scroll-reveal.module.css";

export function ScrollReveal({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={visible ? `${styles.reveal} ${styles.revealVisible}` : styles.reveal}>
      {children}
    </div>
  );
}
