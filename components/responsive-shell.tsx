"use client";

import { usePathname } from "next/navigation";

export function ResponsiveShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = ["/", "/method", "/privacy", "/terms"].includes(pathname);
  const isOpsPage = pathname === "/ops" || pathname.startsWith("/ops/");

  return (
    <div className={isPublicPage || isOpsPage ? "landing-site-shell" : "mobile-app-shell"}>
      {children}
    </div>
  );
}
