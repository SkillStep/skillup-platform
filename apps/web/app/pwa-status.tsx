"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./pwa-status.module.css";

type InstallPromptEvent = Event &
  Readonly<{
    prompt: () => Promise<void>;
    userChoice: Promise<Readonly<{ outcome: "accepted" | "dismissed"; platform: string }>>;
  }>;

export function PwaStatus() {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const refreshing = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    const handleControllerChange = () => {
      if (refreshing.current) return;
      refreshing.current = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
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
      window.removeEventListener("appinstalled", handleInstalled);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  async function install(): Promise<void> {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function update(): void {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  }

  if (online && !installPrompt && !waitingWorker) return null;

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
      {installPrompt && online ? (
        <div>
          <p>Install SkillUp for quicker access from this device.</p>
          <button type="button" onClick={() => void install()}>
            Install SkillUp
          </button>
        </div>
      ) : null}
    </aside>
  );
}
