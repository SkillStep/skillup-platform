import { BrandMark } from "@skillup/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./discovery.module.css";

export type BreadcrumbItem = Readonly<{
  label: string;
  href?: string;
}>;

export function PublicHeader(): ReactNode {
  return (
    <header className={styles["siteHeader"]}>
      <Link className={styles["brandLink"]} href="/en" aria-label="SkillUp home">
        <BrandMark className="brand-mark" />
      </Link>

      <nav className={styles["desktopNav"]} aria-label="Primary navigation">
        <Link href="/en/skills">Browse skills</Link>
        <Link href="/en/categories/launch-skills">Launch catalog</Link>
        <Link href="/en/progress">Your progress</Link>
        <Link className={styles["navAction"]} href="/en/sign-in">
          Sign in
        </Link>
      </nav>

      <details className={styles["mobileMenu"]}>
        <summary aria-label="Open navigation">Menu</summary>
        <nav aria-label="Mobile navigation">
          <Link href="/en/skills">Browse skills</Link>
          <Link href="/en/categories/launch-skills">Launch catalog</Link>
          <Link href="/en/progress">Your progress</Link>
          <Link href="/en/sign-in">Sign in</Link>
        </nav>
      </details>
    </header>
  );
}

export function Breadcrumbs({ items }: Readonly<{ items: readonly BreadcrumbItem[] }>): ReactNode {
  return (
    <nav className={styles["breadcrumbs"]} aria-label="Breadcrumb">
      <ol>
        {items.map((item) => (
          <li key={item.href ?? item.label}>
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PublicFooter(): ReactNode {
  return (
    <footer className={styles["siteFooter"]}>
      <div>
        <BrandMark className="brand-mark brand-mark-footer" />
        <p>Learn. Play. Level Up.</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/en/skills">Skills</Link>
        <Link href="/en/categories/launch-skills">Launch catalog</Link>
        <Link href="/offline">Offline help</Link>
      </nav>
      <p>© {new Date().getUTCFullYear()} SkillUp.</p>
    </footer>
  );
}

export function JsonLd({
  value,
}: Readonly<{ value: Readonly<Record<string, unknown>> }>): ReactNode {
  const json = JSON.stringify(value).replaceAll("<", "\\u003c");
  return <script type="application/ld+json">{json}</script>;
}
