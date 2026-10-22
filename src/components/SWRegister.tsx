"use client";

import { useEffect } from "react";

/** Registers the service worker for installability / offline shell. */
export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* non-fatal */
    });
  }, []);
  return null;
}
