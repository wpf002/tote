"use client";

import { useEffect } from "react";

/** Registers the service worker so the barn-capture PWA installs and works offline. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline capability is best-effort */
      });
    }
  }, []);
  return null;
}
