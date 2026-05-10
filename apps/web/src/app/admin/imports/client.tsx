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

const RL_OFFSET_KEY = "rta:rl-import:offset";
const RL_TOTAL_KEY = "rta:rl-import:total";

interface ImportResult {
  success: boolean;
  count?: number;
  imported?: number;
  blacklisted?: number;
  skipped?: number;
  processed?: number;
  offset?: number;
  nextOffset?: number;
  totalProducts?: number;
  done?: boolean;
  total?: number;
  tmdb?: number;
  anime?: number;
  games?: number;
  manual?: number;
  message?: string;
  error?: string;
}

async function parseImportResponse(res: Response): Promise<ImportResult> {
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (isJson) {
    return (await res.json()) as ImportResult;
  }

  const rawText = await res.text();
  const preview = rawText.slice(0, 200).replace(/\s+/g, " ").trim();
  return {
    success: false,
    error: `Réponse non JSON (${res.status}). ${preview || "Aucun détail"}`
  };
}

export default function AdminImportsClient() {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportResult>>({});

  async function runRocketLeagueImport(action: ImportAction) {
    const proxyPath = action.endpoint.replace(/^\/import\//, "/");
    let batchSize = 40;
    const savedOffset = Number(window.localStorage.getItem(RL_OFFSET_KEY) ?? "0");
    const savedTotal = Number(window.localStorage.getItem(RL_TOTAL_KEY) ?? "0");
    let offset = Number.isFinite(savedOffset) && savedOffset > 0 ? savedOffset : 0;
    let totalProducts = Number.isFinite(savedTotal) && savedTotal > 0 ? savedTotal : 0;
    let imported = 0;
    let blacklisted = 0;
    let skipped = 0;
    let retries = 0;

    while (true) {
      setResults((prev) => ({
        ...prev,
        [action.id]: {
          success: false,
          message: `En cours... ${offset}/${totalProducts || "?"}`
        }
      }));

      const res = await fetch(`${PROXY_BASE}${proxyPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize, offset }),
      });

      const data = await parseImportResponse(res);
      if (!data.success) {
        const errorMessage = data.error ?? data.message ?? "Erreur import Rocket League";
        const isTimeout = errorMessage.includes("(524)") || errorMessage.includes(" 524");

        if (isTimeout && batchSize > 10) {
          batchSize = Math.max(10, Math.floor(batchSize / 2));
          retries = 0;
          continue;
        }

        if (isTimeout && retries < 4) {
          retries += 1;
          continue;
        }

        throw new Error(errorMessage);
      }

      retries = 0;

      imported += data.imported ?? 0;
      blacklisted += data.blacklisted ?? 0;
      skipped += data.skipped ?? 0;
      totalProducts = data.totalProducts ?? totalProducts;
      offset = data.nextOffset ?? offset;
      window.localStorage.setItem(RL_OFFSET_KEY, String(offset));
      if (totalProducts > 0) {
        window.localStorage.setItem(RL_TOTAL_KEY, String(totalProducts));
      }

      if (data.done) {
        window.localStorage.removeItem(RL_OFFSET_KEY);
        window.localStorage.removeItem(RL_TOTAL_KEY);
        setResults((prev) => ({
          ...prev,
          [action.id]: {
            success: true,
            imported,
            blacklisted,
            skipped,
            totalProducts,
            done: true,
            message: `Rocket League import terminé (${offset}/${totalProducts})`
          }
        }));
        return;
      }
    }
  }

  async function runImport(action: ImportAction) {
    setLoading(action.id);
    setResults((prev) => ({ ...prev, [action.id]: { success: false, message: "En cours..." } }));

    try {
      if (action.id === "rocket-league-items") {
        await runRocketLeagueImport(action);
        return;
      }

      // Remplace /import/xxx → /api/admin/import/xxx
      const proxyPath = action.endpoint.replace(/^\/import\//, "/");
      const res = await fetch(`${PROXY_BASE}${proxyPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.body),
      });

      const data = await parseImportResponse(res);
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
    if (!result.success && result.message?.startsWith("En cours...")) return `⏳ ${result.message}`;
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
