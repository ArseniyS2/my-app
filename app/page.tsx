import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  const buttonClass =
    "rounded-2xl bg-[#3a1d4a] px-6 py-3 text-sm font-medium text-white shadow-lg shadow-purple-900/30 transition-all duration-300 hover:scale-105 hover:bg-[#4a2d5a] hover:shadow-xl hover:shadow-purple-600/40 dark:bg-[#3a1d4a] dark:hover:bg-[#4a2d5a]";

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center font-sans"
      style={{
        backgroundImage: "url(/mainPageBG.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <main className="relative z-10 flex flex-col items-center gap-10 px-6 -translate-y-[40px]">
        <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md">
          Kizuna
        </h1>
        <p className="text-center text-zinc-200 drop-shadow-sm">
          Your anime watchlist, together.
        </p>
        {session ? (
          <Link href="/dashboard" className={buttonClass}>
            Go to dashboard
          </Link>
        ) : (
          <Link href="/signin" className={buttonClass}>
            Sign in
          </Link>
        )}
      </main>
    </div>
  );
}
