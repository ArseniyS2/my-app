import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const nextAuthHandler = NextAuth(authOptions);

/* Rate-limit login attempts: 10 requests per 60 seconds per IP. */
async function rateLimitedPost(req: Request, ctx: unknown) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const result = rateLimit(`auth:${ip}`, 10, 60_000);

  if (!result.allowed) {
    return Response.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
        },
      }
    );
  }

  return nextAuthHandler(req, ctx);
}

export { nextAuthHandler as GET, rateLimitedPost as POST };
