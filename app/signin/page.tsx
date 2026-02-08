import { redirect } from "next/navigation";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SignInForm from "./SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) redirect("/dashboard");

  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  const error = params.error;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 font-sans">
      {/* Full-screen background image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/sign-in-BG.png"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      </div>
      {/* Frosted glass sign-in card — large enough to fully cover central logo */}
      <div className="relative z-10 w-full max-w-md rounded-2xl px-10 py-12 shadow-xl backdrop-blur-md backdrop-saturate-100"
           style={{ backgroundColor: "rgba(220, 200, 230, 0.22)" }}>
        <h1 className="mb-10 text-center text-2xl font-semibold text-zinc-900">
          Sign-in
        </h1>
        <SignInForm callbackUrl={callbackUrl} error={error} />
      </div>
    </div>
  );
}
