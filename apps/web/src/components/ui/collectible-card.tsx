import Image from "next/image";
import Link from "next/link";

type Rarity = "Common" | "Uncommon" | "Rare" | "Very Rare" | "Import" | "Exotic" | "Black Market" | "Limited";

const rarityGlow: Record<Rarity, string> = {
  "Common":       "border-rta-border",
  "Uncommon":     "glow-uncommon",
  "Rare":         "glow-rare",
  "Very Rare":    "glow-very-rare",
  "Import":       "glow-import",
  "Exotic":       "glow-exotic",
  "Black Market": "glow-black-market",
  "Limited":      "glow-limited",
};

const rarityBadge: Record<Rarity, string> = {
  "Common":       "bg-rta-surface2 text-rta-muted",
  "Uncommon":     "bg-rta-success/15 text-rta-success border border-rta-success",
  "Rare":         "bg-rta-accentHi/20 text-purple-300 border border-rta-accentHi",
  "Very Rare":    "bg-purple-500/15 text-purple-300 border border-purple-500",
  "Import":       "bg-rta-cta/15 text-rta-cta border border-rta-cta",
  "Exotic":       "bg-red-500/15 text-red-400 border border-red-500",
  "Black Market": "bg-gradient-to-r from-rta-gold to-rta-cta text-rta-bg font-black",
  "Limited":      "bg-rta-gold/15 text-rta-gold border border-rta-gold",
};

type Props = {
  name: string;
  rarity: string;
  deck: string;
  imageUrl?: string | null;
  count?: number;
  href?: string;
};

export default function CollectibleCard({ name, rarity, deck, imageUrl, count, href }: Props) {
  const r = rarity as Rarity;
  const glowClass = rarityGlow[r] ?? "border-rta-border";
  const badgeClass = rarityBadge[r] ?? "bg-rta-surface2 text-rta-muted";

  const card = (
    <article className={`bg-rta-surface border rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-1 cursor-pointer relative ${glowClass}`}>
      <div className="aspect-[3/4] w-full bg-gradient-to-b from-rta-surface2 to-rta-bg flex items-center justify-center relative">
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill className="object-cover" sizes="220px" />
        ) : (
          <span className="text-4xl opacity-30">🃏</span>
        )}
        <span className={`absolute top-2 right-2 text-[0.6rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeClass}`}>
          {rarity}
        </span>
        <span className="absolute bottom-2 left-2 text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full bg-rta-bg/80 text-rta-muted border border-rta-ink/15">
          {deck}
        </span>
        {count !== undefined && (
          <span className="absolute bottom-2 right-2 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-rta-bg/85 text-rta-cta border border-rta-cta/30">
            ×{count}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-bold text-rta-ink truncate">{name}</p>
        <p className="text-[0.68rem] text-rta-muted uppercase tracking-wide mt-0.5">{rarity}</p>
      </div>
    </article>
  );

  return href ? <Link href={href} className="block">{card}</Link> : card;
}
