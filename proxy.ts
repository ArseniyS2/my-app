import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = ["/dashboard"];

function isProtected(pathname: string) {
  return protectedPaths.some((path) =>
    pathname === path || pathname.startsWith(path + "/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtected(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const signIn = new URL("/signin", request.url);
      signIn.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signIn);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
