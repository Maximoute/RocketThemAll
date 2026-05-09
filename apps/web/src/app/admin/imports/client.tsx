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
    body: { limit: 150, pages: 10 },
    description: "Tendances TMDb (films + séries) — nécessite TMDB_API_KEY"
  },
  {
    id: "pop-cinema-films",
    label: "Deck Cinema Films",
    emoji: "🍿",
    endpoint: "/import/pop/cinema-films",
    body: { limit: 500, pages: 30 },
    description: "Deck jouable cinema_films (image obligatoire, aliases, rareté custom)"
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
  {
    id: "pop-nekos",
    label: "Neko Cards",
    emoji: "🐱",
    endpoint: "/import/pop/nekos",
    body: { limit: 100 },
    description: "Images neko anime via nekos.best — 100 cartes, gratuit"
  },
  {
    id: "rocket-league-items",
    label: "Rocket League Items",
    emoji: "🚘",
    endpoint: "/import/rocket-league/items",
    body: {},
    description: "Source principale @rocketleagueapi/items + fusion images externe + blacklist auto si image absente"
  },
];

interface ImportResult {
  success: boolean;
  count?: number;
  imported?: number;
  blacklisted?: number;
  skipped?: number;
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
    if (result.imported !== undefined) {
      return `✅ ${result.imported} importées | 🚫 ${result.blacklisted ?? 0} blacklistées (image manquante) | ⏭️ ${result.skipped ?? 0} filtrées`;
    }
    if (result.total !== undefined) {
      return `✅ ${result.total} cartes — TMDb: ${result.tmdb ?? 0} | Anime: ${result.anime ?? 0} | Jeux: ${result.games ?? 0} | Manuel: ${result.manual ?? 0}`;
    }
    if ((result.count ?? 0) === 0) {
      return "✅ 0 nouvelle carte (déjà importées ou filtrées)";
    }
    return `✅ ${result.count ?? 0} cartes importées`;
  }

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight mb-1">Import de cartes</h1>
      <p className="text-rta-muted text-sm mb-6">
        Chaque import est idempotent: les cartes déjà présentes sont ignorées par sourceId.
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {IMPORT_ACTIONS.map((action) => {
          const result = results[action.id];
          const isLoading = loading === action.id;
          const anyLoading = loading !== null;

          return (
            <article
              key={action.id}
              className={[
                "bg-rta-surface rounded-xl p-4 flex flex-col gap-3 border",
                result?.success ? "border-rta-success/50" : "",
                result && !result.success ? "border-red-500/50" : "",
                !result ? "border-rta-border" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{action.emoji}</span>
                <strong className="text-rta-ink">{action.label}</strong>
              </div>
              <p className="text-sm text-rta-muted m-0">{action.description}</p>

              {result && (
                <div
                  className={[
                    "text-sm px-3 py-2 rounded-lg border",
                    result.success ? "bg-rta-success/10 text-rta-success border-rta-success/30" : "",
                    result.message === "En cours..." ? "bg-rta-accent/10 text-purple-300 border-rta-accent/30" : "",
                    !result.success && result.message !== "En cours..." ? "bg-red-500/10 text-red-300 border-red-500/30" : "",
                  ].join(" ")}
                >
                  {formatResult(result)}
                </div>
              )}

              <button
                onClick={() => runImport(action)}
                disabled={anyLoading}
                className={[
                  "mt-auto px-4 py-2 rounded-lg text-sm font-bold transition-colors",
                  isLoading ? "bg-rta-surface2 text-rta-muted" : "bg-rta-cta text-rta-bg hover:bg-rta-cta/90",
                  anyLoading ? "cursor-not-allowed" : "",
                  anyLoading && !isLoading ? "opacity-60" : "",
                ].join(" ")}
              >
                {isLoading ? "⏳ Import en cours..." : `Lancer l'import`}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
