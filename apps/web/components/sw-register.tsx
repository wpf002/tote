"use client";

import { useEffect } from "react";

/** Registers the service worker so the barn-capture PWA installs and works offline. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Dev chunk URLs are stable, so a cached copy would pin the app to its
    // first-ever build. Tear down any worker a previous run left registered.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => caches.keys())
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {
          /* best-effort cleanup */
        });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline capability is best-effort */
    });
  }, []);
  return null;
}
