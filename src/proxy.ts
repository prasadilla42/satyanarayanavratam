import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protects /admin and /api/admin with HTTP Basic Auth.
 * Credentials come from ADMIN_USER (default "admin") and ADMIN_PASSWORD.
 * If ADMIN_PASSWORD is not set the admin area is disabled entirely.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse("Admin is disabled: set ADMIN_PASSWORD to enable it.", { status: 503 });
  }
  const user = process.env.ADMIN_USER || "admin";

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(":");
      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (idx >= 0 && safeEqual(u, user) && safeEqual(p, password)) {
        const res = NextResponse.next();
        res.headers.set("Cache-Control", "no-store");
        res.headers.set("X-Robots-Tag", "noindex, nofollow");
        return res;
      }
    } catch {
      /* fall through */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Satyanarayana Vratam admin", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
