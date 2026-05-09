"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; icon: string; label: string; badge?: number };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Vue d'ensemble",
    items: [{ href: "/admin", icon: "📊", label: "Dashboard" }],
  },
  {
    section: "Contenu",
    items: [
      { href: "/admin/cards",   icon: "🃏", label: "Cartes"  },
      { href: "/admin/imports", icon: "📥", label: "Imports" },
    ],
  },
  {
    section: "Utilisateurs",
    items: [
      { href: "/admin/users",       icon: "👥", label: "Utilisateurs" },
      { href: "/admin/inventories", icon: "🎒", label: "Inventaires"  },
    ],
  },
  {
    section: "Système",
    items: [
      { href: "/admin/logs",    icon: "📋", label: "Logs"     },
      { href: "/admin/servers", icon: "🖥️", label: "Serveurs" },
      { href: "/admin/config",  icon: "⚙️", label: "Config"   },
      { href: "/admin/economy", icon: "💰", label: "Économie" },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 shrink-0 bg-[#140A3A] border-r border-rta-border flex flex-col gap-0.5 py-4 overflow-y-auto">
      {NAV.map(({ section, items }) => (
        <div key={section}>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-rta-border px-4 pt-3 pb-1">
            {section}
          </p>
          {items.map(({ href, icon, label, badge }) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "flex items-center gap-2.5 px-4 py-2 text-sm border-l-[3px] transition-colors",
                  active
                    ? "text-rta-ink border-rta-cta bg-rta-cta/[0.08]"
                    : "text-rta-muted border-transparent hover:text-rta-ink hover:bg-rta-accent/10",
                ].join(" ")}
              >
                <span className="w-4 text-center">{icon}</span>
                <span className="flex-1">{label}</span>
                {badge !== undefined && (
                  <span className="bg-rta-cta text-rta-bg text-[0.6rem] font-black px-1.5 py-0.5 rounded-full">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
