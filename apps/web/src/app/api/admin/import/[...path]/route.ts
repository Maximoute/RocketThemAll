import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";
import { prisma } from "@rta/database";

const INTERNAL_API = process.env.INTERNAL_API_URL ?? "http://api:4000";

// Endpoints autorisés (whitelist de sécurité) — chemin sans le préfixe /import/
const ALLOWED_ENDPOINTS = new Set([
  "/pokemon",
  "/pop/movies",
  "/pop/anime",
  "/pop/games",
  "/pop/manual",
  "/pop/all",
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

  try {
    const res = await fetch(`${INTERNAL_API}/import${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur interne" },
      { status: 500 }
    );
  }
}
