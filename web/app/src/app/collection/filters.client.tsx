"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = { value: string; label: string };

type Props = {
  decks: Option[];
  rarities: Option[];
  categories: Option[];
  initial: {
    q?: string;
    deck?: string;
    rarity?: string;
    category?: string;
    sort?: string;
    order?: string;
  };
};

export default function CollectionFiltersClient({ decks, rarities, categories, initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initial.q ?? "");

  const apply = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (q !== current) apply({ q });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <form style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem", alignItems: "center" }} onSubmit={(e) => e.preventDefault()}>
      <input
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher..."
        style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}
      />
      <select name="deck" value={searchParams.get("deck") ?? ""} onChange={(e) => apply({ deck: e.target.value })} style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}>
        <option value="">Tous les decks</option>
        {decks.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <select name="rarity" value={searchParams.get("rarity") ?? ""} onChange={(e) => apply({ rarity: e.target.value })} style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}>
        <option value="">Toutes les raretés</option>
        {rarities.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <select name="category" value={searchParams.get("category") ?? ""} onChange={(e) => apply({ category: e.target.value })} style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}>
        <option value="">Toutes catégories</option>
        {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <select name="sort" value={searchParams.get("sort") ?? (initial.sort ?? "name")} onChange={(e) => apply({ sort: e.target.value })} style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}>
        <option value="name">Tri : Alphabétique</option>
        <option value="rarity">Tri : Rareté</option>
        <option value="deck">Tri : Deck</option>
        <option value="category">Tri : Catégorie</option>
      </select>
      <select name="order" value={searchParams.get("order") ?? (initial.order ?? "asc")} onChange={(e) => apply({ order: e.target.value })} style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}>
        <option value="asc">Ordre : Croissant</option>
        <option value="desc">Ordre : Décroissant</option>
      </select>
      <button type="button" onClick={() => router.replace(pathname)} style={{ padding: "0.4rem 0.8rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem", cursor: "pointer" }}>
        Réinitialiser
      </button>
    </form>
  );
}
