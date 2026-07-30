import type { HTMLAttributes, ReactNode } from "react";

export type BrandMarkProps = Readonly<{
  compact?: boolean;
  className?: string;
}>;

export function BrandMark({ compact = false, className }: BrandMarkProps): ReactNode {
  return (
    <span className={className} aria-label="SkillUp">
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 44 44"
        width="44"
        height="44"
        role="img"
      >
        <rect x="4" y="24" width="12" height="12" rx="4" fill="currentColor" opacity="0.45" />
        <rect x="16" y="16" width="12" height="12" rx="4" fill="currentColor" opacity="0.72" />
        <path d="M28 8h12v12h-6v-3.75L24.25 26 18 19.75 8.75 29 4.5 24.75 18 11.25l6.25 6.25L29.75 12H28V8Z" fill="currentColor" />
      </svg>
      {compact ? null : <span>SkillUp</span>}
    </span>
  );
}

export type SurfaceProps = HTMLAttributes<HTMLElement> &
  Readonly<{
    as?: "article" | "section";
  }>;

export function Surface({ as: Element = "section", children, ...props }: SurfaceProps): ReactNode {
  return <Element {...props}>{children}</Element>;
}
