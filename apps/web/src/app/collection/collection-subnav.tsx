import Link from "next/link";

export default function CollectionSubnav({ active }: { active: "collection" | "reactor" }) {
  const items = [
    { key: "collection" as const, href: "/collection", label: "🗂️ Cartes" },
    { key: "reactor" as const, href: "/collection/reactor", label: "⚛️ Réacteur d’Anomalies" }
  ];

  return (
    <nav
      aria-label="Sous-menu de la collection"
      className="mb-6 flex w-full gap-2 rounded-xl border border-rta-border bg-rta-surface p-2"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? "page" : undefined}
          className={[
            "flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-black transition-colors",
            active === item.key
              ? "bg-rta-accentHi text-white shadow-lg shadow-rta-accentHi/20"
              : "text-rta-muted hover:bg-rta-surface2 hover:text-rta-ink"
          ].join(" ")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
