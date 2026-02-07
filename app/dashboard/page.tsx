import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DashboardContent from "./DashboardContent";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  // Layout already redirects if no session, but guard just in case
  if (!session) return null;

  return <DashboardContent username={session.user.username} />;
}
