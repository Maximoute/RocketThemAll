import { NextResponse } from "next/server";
import { resolveSessionUser } from "@rta/auth/web-auth";
import { isPrivateDevelopmentEnvironment } from "@rta/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isPrivateDevelopmentEnvironment()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json(
      { error: "RTA administrator permission required" },
      { status: 403 },
    );
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
