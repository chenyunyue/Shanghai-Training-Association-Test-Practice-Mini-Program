"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then(async () => {
      const cache = await caches.open("exam-shell-v1");
      const resources = performance.getEntriesByType("resource")
        .map(entry => entry.name)
        .filter(url => url.startsWith(`${location.origin}/`) && /\.(?:js|css|woff2?)(?:\?|$)/.test(url));
      await Promise.allSettled(resources.map(url => cache.add(url)));
    });
  }, []);
  return null;
}
