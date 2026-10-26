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
 * Full-width campaign hero. Desktop/mobile art swap; image always spans the
 * landing column and scales by aspect ratio (no cropping).
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
        sizes="(max-width: 900px) 100vw, 900px"
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
