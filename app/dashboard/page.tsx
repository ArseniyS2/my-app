import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import SignOutButton from "./SignOutButton";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/signin");

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Kizuna
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {session.user.username}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Your watched anime list will appear here. (Coming soon.)
        </p>
      </main>
    </div>
  );
}
