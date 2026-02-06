import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import SignOutButton from "../SignOutButton";

export default async function DashboardAnimePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/signin");

  const { id } = await params;

  return (
    <div className="min-h-screen bg-[#0D0B14] text-[#E8E0F0]">
      <header className="sticky top-0 z-30 border-b border-[#2A2440] bg-[#13111C]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight"
          >
            Kizuna
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#8B7FA0]">
              {session.user.username}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/dashboard"
          className="text-sm text-[#8B7FA0] transition-colors hover:text-[#E8E0F0]"
        >
          ← Back to dashboard
        </Link>
        <h2 className="mt-4 text-xl font-semibold">
          Anime #{id}
        </h2>
        <p className="mt-2 text-[#8B7FA0]">
          Anime details will be shown here. (Coming soon.)
        </p>
      </main>
    </div>
  );
}
