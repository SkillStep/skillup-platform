"use client";

import { useEffect, useState } from "react";

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function openViaProtocol(protocolUrl: string): void {
  const anchor = document.createElement("a");
  anchor.href = protocolUrl;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Campaign landings must run in a normal browser tab. If Windows/Chrome already
 * captured the URL into the installed SkillUp desktop PWA, break out.
 */
export function LandingBrowserEscape(): null {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!isStandaloneDisplay()) return;
    setArmed(true);

    const url = window.location.href;
    // Windows protocol handlers open a real browser window outside the PWA.
    openViaProtocol(`microsoft-edge:${url}`);
    openViaProtocol(`googlechrome:${url}`);

    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Popup blockers are fine — protocol handlers may still succeed.
    }
  }, []);

  useEffect(() => {
    if (!armed) return;
    if (document.getElementById("skillup-open-in-browser")) return;

    const banner = document.createElement("div");
    banner.id = "skillup-open-in-browser";
    banner.setAttribute("role", "status");
    banner.style.cssText =
      "position:fixed;z-index:99999;left:0;right:0;top:0;padding:10px 12px;background:#1a1530;color:#fff;font:600 13px/1.4 Arial,Helvetica,sans-serif;text-align:center";
    banner.innerHTML =
      'This offer should open in your browser. <a href="' +
      window.location.href +
      '" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;text-decoration:underline">Click here to open in browser</a>';
    document.body.prepend(banner);
  }, [armed]);

  return null;
}
