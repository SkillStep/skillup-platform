import Image from "next/image";
import type { ReactElement } from "react";

import styles from "./landing.module.css";

export type LandingBannerProps = Readonly<{
  desktopSrc: string;
  mobileSrc: string;
  alt: string;
  desktopWidth: number;
  desktopHeight: number;
  mobileWidth: number;
  mobileHeight: number;
}>;

/**
 * Art-directed campaign hero: landscape on desktop, portrait creative on mobile.
 * Uses CSS display swap so each breakpoint gets the correct aspect ratio for CLS.
 */
export function LandingBanner({
  desktopSrc,
  mobileSrc,
  alt,
  desktopWidth,
  desktopHeight,
  mobileWidth,
  mobileHeight,
}: LandingBannerProps): ReactElement {
  return (
    <div className={styles["bannerSwap"]}>
      <Image
        src={desktopSrc}
        alt={alt}
        width={desktopWidth}
        height={desktopHeight}
        className={`${styles["bannerImage"]} ${styles["bannerDesktop"]}`}
        priority
        sizes="(max-width: 720px) 1px, (max-width: 900px) 100vw, 900px"
      />
      <Image
        src={mobileSrc}
        alt={alt}
        width={mobileWidth}
        height={mobileHeight}
        className={`${styles["bannerImage"]} ${styles["bannerMobile"]}`}
        priority
        sizes="(max-width: 720px) 100vw, 1px"
      />
    </div>
  );
}
