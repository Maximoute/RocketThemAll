"use client";

import { useState } from "react";

// Proxy Next.js — pas besoin d'exposer l'URL de l'API interne
const PROXY_BASE = "/api/admin/import";

interface ImportAction {
  id: string;
  label: string;
  emoji: string;
  endpoint: string;
  body: Record<string, unknown>;
  description: string;
}

const IMPORT_ACTIONS: ImportAction[] = [
  {
    id: "pokemon",
    label: "Pokémon",
    emoji: "🔴",
    endpoint: "/import/pokemon",
    body: { limit: 10000 },
    description: "Tous les Pokémon via PokéAPI (noms FR + Shiny)"
  },
  {
    id: "pop-movies",
    label: "Films & Séries",
    emoji: "🎬",
    endpoint: "/import/pop/movies",
    body: { limit: 150, pages: 3 },
    description: "Tendances TMDb (films + séries) — nécessite TMDB_API_KEY"
  },
  {
    id: "pop-anime",
    label: "Anime & Manga",
    emoji: "🎌",
    endpoint: "/import/pop/anime",
    body: { limit: 100, pages: 4 },
    description: "Top anime et manga via Jikan (MyAnimeList) — gratuit"
  },
  {
    id: "pop-games",
    label: "Jeux Vidéo",
    emoji: "🎮",
    endpoint: "/import/pop/games",
    body: { limit: 100, pages: 4 },
    description: "Meilleurs jeux via RAWG — nécessite RAWG_API_KEY"
  },
  {
    id: "pop-manual",
    label: "Cartes Manuelles",
    emoji: "📋",
    endpoint: "/import/pop/manual",
    body: {},
    description: "Mèmes, musique, comics, sport, internet (data/pop-culture-manual.json)"
  },
  {
    id: "pop-all",
    label: "Pop Culture (tout)",
    emoji: "🌟",
    endpoint: "/import/pop/all",
    body: { tmdbLimit: 150, animeLimit: 100, gameLimit: 100 },
    description: "Import complet : TMDb + Jikan + RAWG + Manuel"
  },
];

interface ImportResult {
  success: boolean;
  count?: number;
  total?: number;
  tmdb?: number;
  anime?: number;
  games?: number;
  manual?: number;
  message?: string;
  error?: string;
}

export default function AdminImportsClient() {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportResult>>({});

  async function runImport(action: ImportAction) {
    setLoading(action.id);
    setResults((prev) => ({ ...prev, [action.id]: { success: false, message: "En cours..." } }));

    try {
    // Remplace /import/xxx → /api/admin/import/xxx
    const proxyPath = action.endpoint.replace(/^\/import\//, "/");
    const res = await fetch(`${PROXY_BASE}${proxyPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.body),
      });

      const data: ImportResult = await res.json();
      setResults((prev) => ({ ...prev, [action.id]: data }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [action.id]: { success: false, error: err instanceof Error ? err.message : "Erreur réseau" }
      }));
    } finally {
      setLoading(null);
    }
  }

  function formatResult(result: ImportResult): string {
    if (!result.success && result.message === "En cours...") return "⏳ En cours...";
    if (!result.success) return `❌ ${result.error ?? result.message ?? "Erreur"}`;
    if (result.total !== undefined) {
      return `✅ ${result.total} cartes — TMDb: ${result.tmdb ?? 0} | Anime: ${result.anime ?? 0} | Jeux: ${result.games ?? 0} | Manuel: ${result.manual ?? 0}`;
    }
    return `✅ ${result.count ?? 0} cartes importées`;
  }

  return (
    <section className="card">
      <h1>Import de cartes</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Chaque import est idempotent — les cartes déjà présentes sont ignorées (déduplication par sourceId).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
        {IMPORT_ACTIONS.map((action) => {
          const result = results[action.id];
          const isLoading = loading === action.id;
          const anyLoading = loading !== null;

          return (
            <article key={action.id} style={{
              background: "var(--card)",
              borderRadius: "10px",
              padding: "1.2rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
              border: result?.success ? "1px solid #4caf5044" : result && !result.success ? "1px solid #f4433644" : "1px solid transparent"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.4rem" }}>{action.emoji}</span>
                <strong style={{ fontSize: "1rem" }}>{action.label}</strong>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>{action.description}</p>

              {result && (
                <div style={{
                  fontSize: "0.85rem",
                  padding: "0.4rem 0.6rem",
                  borderRadius: "6px",
                  background: result.success ? "rgba(76,175,80,0.1)" : result.message === "En cours..." ? "rgba(33,150,243,0.1)" : "rgba(244,67,54,0.1)",
                  color: result.success ? "#2e7d32" : result.message === "En cours..." ? "#1565c0" : "#c62828"
                }}>
                  {formatResult(result)}
                </div>
              )}

              <button
                onClick={() => runImport(action)}
                disabled={anyLoading}
                style={{
                  marginTop: "auto",
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  background: isLoading ? "#bdbdbd" : "var(--accent)",
                  color: "#fff",
                  border: "none",
                  cursor: anyLoading ? "not-allowed" : "pointer",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  opacity: anyLoading && !isLoading ? 0.6 : 1
                }}
              >
                {isLoading ? "⏳ Import en cours..." : `Lancer l'import`}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
