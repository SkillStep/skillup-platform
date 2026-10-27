"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./pwa-status.module.css";

export function PwaStatus() {
  const [online, setOnline] = useState(true);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const refreshing = useRef(false);
  const updateRequested = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Suppress the browser install affordance; do not show an in-app install prompt.
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);

    const handleControllerChange = () => {
      if (!updateRequested.current || refreshing.current) return;
      refreshing.current = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);

    // Do not register a worker from campaign landings — keep those URLs browser-only.
    const onCampaignLanding =
      window.location.pathname === "/mainLanding" ||
      window.location.pathname === "/mainLanding2" ||
      window.location.pathname === "/landing" ||
      window.location.pathname === "/landing2";

    if ("serviceWorker" in navigator && !onCampaignLanding) {
      // Scope matches the web app manifest (/en) so campaign landings stay browser-only.
      void navigator.serviceWorker.register("/sw.js", { scope: "/en" }).then((registration) => {
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(worker);
            }
          });
        });
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  function update(): void {
    if (!waitingWorker) return;
    updateRequested.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  if (online && !waitingWorker) return null;

  return (
    <aside className={styles["status"]} aria-live="polite" aria-label="Application status">
      {!online ? (
        <p>
          You are offline. Public pages may use a saved copy; account, gameplay and progress actions
          wait for a secure connection.
        </p>
      ) : null}
      {waitingWorker ? (
        <div>
          <p>A reviewed SkillUp update is ready.</p>
          <button type="button" onClick={update}>
            Update safely
          </button>
        </div>
      ) : null}
    </aside>
  );
}
