"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/admin", label: "🏠 Dashboard", exact: true },
  { href: "/admin/users", label: "👤 Utilisateurs" },
  { href: "/admin/cards", label: "🃏 Cartes" },
  { href: "/admin/inventories", label: "🎒 Inventaires" },
  { href: "/admin/servers", label: "🖥️ Serveurs" },
  { href: "/admin/economy", label: "💰 Économie" },
  { href: "/admin/config", label: "⚙️ Config" },
  { href: "/admin/imports", label: "📥 Imports" },
  { href: "/admin/logs", label: "📋 Logs" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav style={{
      width: "190px",
      minWidth: "190px",
      background: "#fffaf2",
      border: "1px solid #e4d8c6",
      borderRadius: "12px",
      padding: "12px 8px",
      position: "sticky",
      top: "16px",
      alignSelf: "flex-start",
      display: "flex",
      flexDirection: "column",
      gap: "2px",
    }}>
      <div style={{
        padding: "6px 12px 14px",
        fontWeight: 700,
        fontSize: "15px",
        color: "#d97706",
        borderBottom: "1px solid #e4d8c6",
        marginBottom: "6px",
        letterSpacing: "-0.3px"
      }}>
        ⚡ Admin Panel
      </div>
      {NAV_ITEMS.map(({ href, label, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: "block",
              padding: "7px 12px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "13.5px",
              color: isActive ? "#d97706" : "#1f1b16",
              background: isActive ? "#ffeccf" : "transparent",
              border: isActive ? "1px solid #d9b78a" : "1px solid transparent",
              fontWeight: isActive ? 600 : 400,
              transition: "background 0.1s, border-color 0.1s",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
