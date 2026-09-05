import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { isRtaDevelopmentRequest } from "./lib/environment";

const DEVELOPMENT_SESSION_COOKIE = "__Secure-rta-dev.session-token";
const PUBLIC_DEVELOPMENT_PATHS = [
  "/403",
  "/favicon.png",
  "/login",
  "/robots.txt",
] as const;

function isPublicDevelopmentPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health") ||
    PUBLIC_DEVELOPMENT_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  );
}

function addDevelopmentHeaders(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function middleware(request: NextRequest) {
  if (!isRtaDevelopmentRequest(request.headers.get("host"))) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (isPublicDevelopmentPath(pathname)) {
    return addDevelopmentHeaders(NextResponse.next());
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: DEVELOPMENT_SESSION_COOKIE,
  });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return addDevelopmentHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "callbackUrl",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return addDevelopmentHeaders(NextResponse.redirect(loginUrl));
  }

  if (token.isAdmin !== true) {
    if (pathname.startsWith("/api/")) {
      return addDevelopmentHeaders(
        NextResponse.json(
          { error: "RTA administrator permission required" },
          { status: 403 },
        ),
      );
    }

    return addDevelopmentHeaders(
      NextResponse.rewrite(new URL("/403", request.url), { status: 403 }),
    );
  }

  return addDevelopmentHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
