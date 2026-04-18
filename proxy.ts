import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = ["/dashboard", "/user"];

function isProtected(pathname: string) {
  return protectedPaths.some((path) =>
    pathname === path || pathname.startsWith(path + "/")
  );
}

/** Also protect API routes (except /api/auth and /api/cron which use their own auth). */
function isProtectedApi(pathname: string) {
  return (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/api/cron")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtected(pathname) || isProtectedApi(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      // For API routes return 401 instead of redirecting
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const signIn = new URL("/signin", request.url);
      signIn.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signIn);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/user/:path*", "/api/((?!auth|cron).*)"],
};
