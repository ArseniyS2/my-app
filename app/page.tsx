import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="flex flex-col items-center gap-10 px-6">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Kizuna
        </h1>
        <p className="text-center text-zinc-600 dark:text-zinc-400">
          Your anime watchlist, together.
        </p>
        {session ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/signin"
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Sign in
          </Link>
        )}
      </main>
    </div>
  );
}
