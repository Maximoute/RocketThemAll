import { isRtaDevelopmentRequest } from "../../lib/environment";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const requestHost = request.headers.get("host") ?? new URL(request.url).hostname;
  const disallowAll = isRtaDevelopmentRequest(requestHost);
  const body = disallowAll
    ? "User-agent: *\nDisallow: /\n"
    : "User-agent: *\nAllow: /\n";

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/plain; charset=utf-8",
      ...(disallowAll
        ? { "X-Robots-Tag": "noindex, nofollow, noarchive" }
        : {}),
    },
  });
}
