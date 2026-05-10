import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";
import { prisma } from "@rta/database";
import {
  importPokemon,
  importPopMovies,
  importTmdbMoviesAndSeries,
  importPopAnime,
  importPopGames,
  importPopAll,
  importManualPopCulture,
  importNekos,
  importCinemaFilmsDeck,
  importRocketLeagueItems
} from "@rta/importers";

// Endpoints autorisés (whitelist de sécurité) — chemin sans le préfixe /import/
const ALLOWED_ENDPOINTS = new Set([
  "/pokemon",
  "/pop/movies",
  "/pop/cinema-films",
  "/pop/anime",
  "/pop/games",
  "/pop/manual",
  "/pop/all",
  "/pop/nekos",
  "/rocket-league/items",
]);

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  // Vérification admin
  const session = await getServerSession(authOptions);
  const username = session?.user?.name ?? "";
  const user = username ? await prisma.user.findFirst({ where: { username } }) : null;
  if (!user?.isAdmin) {
    return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 403 });
  }

  const endpoint = "/" + params.path.join("/");
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return NextResponse.json({ success: false, error: "Endpoint non autorisé" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = typeof body?.limit === "number" ? body.limit : 100;
  const pages = typeof body?.pages === "number" ? body.pages : 8;

  try {
    if (endpoint === "/pokemon") {
      const count = await importPokemon(limit);
      return NextResponse.json({ success: true, count, message: `Imported ${count} Pokémon` });
    }

    if (endpoint === "/pop/movies") {
      const count = await importTmdbMoviesAndSeries(limit, 1, pages);
      return NextResponse.json({ success: true, count, message: `Imported ${count} movie/tv cards` });
    }

    if (endpoint === "/pop/cinema-films") {
      const result = await importCinemaFilmsDeck(limit, pages);
      return NextResponse.json({ success: true, ...result, message: `Imported ${result.imported} cinema films cards` });
    }

    if (endpoint === "/pop/anime") {
      const count = await importPopAnime(limit);
      return NextResponse.json({ success: true, count, message: `Imported ${count} anime/manga cards` });
    }

    if (endpoint === "/pop/games") {
      const count = await importPopGames(limit);
      return NextResponse.json({ success: true, count, message: `Imported ${count} video game cards` });
    }

    if (endpoint === "/pop/manual") {
      const count = await importManualPopCulture();
      return NextResponse.json({ success: true, count, message: `Imported ${count} manual pop culture cards` });
    }

    if (endpoint === "/pop/nekos") {
      const count = await importNekos(limit);
      return NextResponse.json({ success: true, count, message: `Imported ${count} neko cards` });
    }

    if (endpoint === "/pop/all") {
      const total = await importPopAll(limit);
      return NextResponse.json({ success: true, total, message: `Imported ${total} pop culture cards total` });
    }

    if (endpoint === "/rocket-league/items") {
      const batchSize = typeof body?.batchSize === "number" ? body.batchSize : 40;
      const offset = typeof body?.offset === "number" ? body.offset : 0;
      const result = await importRocketLeagueItems({ limit: batchSize, offset });
      return NextResponse.json({
        success: true,
        imported: result.created + result.updated,
        blacklisted: result.blacklisted,
        skipped: result.skipped,
        processed: result.processed,
        offset: result.offset,
        nextOffset: result.nextOffset,
        totalProducts: result.totalProducts,
        done: result.done,
        message: result.done
          ? `Rocket League import terminé (${result.totalProducts}/${result.totalProducts} produits parcourus).`
          : `Rocket League import en cours (${result.nextOffset}/${result.totalProducts} produits parcourus).`
      });
    }

    return NextResponse.json({ success: false, error: "Endpoint non géré" }, { status: 400 });
  } catch (err) {
    console.error("[web:admin-import] route failure", err);
    const message = err instanceof Error ? err.message : "Erreur interne";

    if (message.includes("TMDB_API_KEY is not set")) {
      return NextResponse.json(
        { success: false, error: "TMDB_API_KEY manquant dans .env" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
