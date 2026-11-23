"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      const id = sessionStorage.getItem("badger-anonymous-id") ?? crypto.randomUUID();
      sessionStorage.setItem("badger-anonymous-id", id);
      void fetch("/api/events", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ event: "client_error", anonymousId: id, path: location.pathname, properties: { name: error.name, message: error.message, digest: error.digest ?? null } }),
      });
    } catch {}
  }, [error]);
  return (
    <html lang="en"><body style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#FAF7F0", textAlign: "center", padding: 24 }}>
      <main><h1>Bo hit a snag.</h1><p>Your progress is safe. Try again.</p><button type="button" onClick={reset} style={{ marginTop: 20, padding: "12px 20px" }}>Try again</button></main>
    </body></html>
  );
}
