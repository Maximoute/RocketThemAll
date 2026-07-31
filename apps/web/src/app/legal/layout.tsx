import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const links = [
  ["/legal", "Vue d’ensemble"],
  ["/legal/mentions-legales", "Mentions légales"],
  ["/legal/conditions-utilisation", "Conditions d’utilisation"],
  ["/legal/confidentialite", "Confidentialité"],
  ["/legal/cookies", "Cookies"],
  ["/legal/conditions-vente", "Conditions de vente"],
  ["/legal/retractation", "Rétractation"]
] as const;

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav
        aria-label="Navigation du centre légal"
        className="mb-7 flex gap-2 overflow-x-auto rounded-xl border border-rta-border bg-rta-surface p-2"
      >
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-rta-muted transition-colors hover:bg-rta-surface2 hover:text-rta-ink"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
