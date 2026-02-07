import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, users } from "@/src/db";
import { eq } from "drizzle-orm";
import DashboardContent from "./DashboardContent";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  // Layout already redirects if no session, but guard just in case
  if (!session) return null;

  const [user] = await db
    .select({ userPicture: users.userPicture })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return (
    <DashboardContent
      username={session.user.username}
      userPicture={user?.userPicture ?? null}
    />
  );
}
