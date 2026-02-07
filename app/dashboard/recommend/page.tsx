import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Fallback page for /dashboard/recommend when accessed directly (hard navigation).
 * Redirects back to dashboard — the drawer is intercepted-route only.
 */
export default async function RecommendFallbackPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/signin");
  redirect("/dashboard");
}
