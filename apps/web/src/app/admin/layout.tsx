import type { ReactNode } from "react";
import Link from "next/link";
import AdminSidebar from "./AdminSidebar.client";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-6 -mt-7 flex min-h-screen">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 bg-rta-surface border-b border-rta-border px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3 font-extrabold text-rta-ink">
          <span className="text-xl">🚀</span>
          Rocket Them All
          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rta-cta/15 text-rta-cta border border-rta-cta/40">
            Admin
          </span>
        </div>
        <Link href="/" className="text-sm text-rta-muted hover:text-rta-ink transition-colors">
          ← Retour au site
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 pt-[53px]">
        <AdminSidebar />
        <main className="flex-1 min-w-0 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
