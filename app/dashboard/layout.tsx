import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function DashboardLayout({
  children,
  recommend,
}: {
  children: React.ReactNode;
  recommend: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin");

  return (
    <>
      {children}
      {recommend}
    </>
  );
}
