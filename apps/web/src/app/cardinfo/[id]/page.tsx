import { prisma } from "@rta/database";
import { notFound } from "next/navigation";

const CATEGORY_LABELS: Record<string, string> = {
  movie: "🎬 Film",
  tv: "📺 Série",
  anime: "🎌 Anime",
  manga: "📖 Manga",
  video_game: "🎮 Jeu vidéo",
  meme: "😂 Mème",
  music: "🎵 Musique",
  internet: "🌐 Internet",
  comics: "🦸 Comics",
  sport: "⚽ Sport",
  manual: "📋 Manuel",
};

const RARITY_COLORS: Record<string, string> = {
  Common: "#9e9e9e",
  Uncommon: "#4caf50",
  Rare: "#2196f3",
  "Very Rare": "#9c27b0",
  Import: "#ff9800",
  Exotic: "#f44336",
  "Black Market": "#212121",
  Limited: "#ffd700",
};

export default async function CardInfoPage({ params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: { deck: true, rarity: true },
  });

  if (!card) notFound();

  const rarityColor = RARITY_COLORS[card.rarity.name] ?? "#333";
  const categoryLabel = card.category ? (CATEGORY_LABELS[card.category] ?? card.category) : null;

  return (
    <section className="card" style={{ maxWidth: "600px", margin: "0 auto" }}>
      <a href="/collection" style={{ fontSize: "0.9rem", color: "var(--accent)", textDecoration: "none", marginBottom: "1rem", display: "inline-block" }}>
        ← Retour à la collection
      </a>

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
        {card.imageUrl && (
          <img
            src={card.imageUrl}
            alt={card.name}
            style={{ width: "200px", height: "280px", objectFit: "cover", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}
          />
        )}
        <div style={{ flex: 1, minWidth: "200px", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>{card.name}</h1>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{
              fontWeight: 700,
              color: rarityColor,
              background: `${rarityColor}18`,
              padding: "0.25rem 0.6rem",
              borderRadius: "6px",
              fontSize: "0.9rem",
              border: `1px solid ${rarityColor}44`
            }}>
              {card.rarity.name}
            </span>
            {categoryLabel && (
              <span style={{
                background: "rgba(0,0,0,0.07)",
                padding: "0.25rem 0.6rem",
                borderRadius: "6px",
                fontSize: "0.9rem"
              }}>
                {categoryLabel}
              </span>
            )}
          </div>

          <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            <strong>Deck :</strong> {card.deck.name}
          </div>

          <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            <strong>XP :</strong> +{card.xpReward} &nbsp;|&nbsp;
            <strong>Drop rate :</strong> {(card.dropRate * 100).toFixed(1)}%
          </div>

          {card.source && (
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              <strong>Source :</strong> {card.source}
              {card.sourceId ? ` — ${card.sourceId}` : ""}
            </div>
          )}
        </div>
      </div>

      {card.description && (
        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(0,0,0,0.04)", borderRadius: "8px", lineHeight: 1.6 }}>
          <strong>Description</strong>
          <p style={{ margin: "0.5rem 0 0", color: "var(--muted)", fontSize: "0.95rem" }}>{card.description}</p>
        </div>
      )}
    </section>
  );
}
