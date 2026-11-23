"use client";

import { useEffect } from "react";
import { track } from "@/lib/telemetry";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void track("client_error", { name: error.name, message: error.message, digest: error.digest ?? null });
  }, [error]);
  return (
    <main className="min-h-dvh bg-peach flex items-center justify-center px-6 text-center">
      <div className="max-w-[340px]">
        <h1 className="font-serif text-[30px] font-semibold">Bo hit a snag.</h1>
        <p className="mt-3 text-[14px] text-ink-60">Your progress is safe. Try this screen again.</p>
        <button type="button" onClick={reset} className="mt-6 rounded-[14px] bg-yellow px-6 py-3.5 text-[15px] font-bold border-0 cursor-pointer">Try again</button>
      </div>
    </main>
  );
}
