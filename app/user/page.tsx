import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, users } from "@/src/db";
import { eq } from "drizzle-orm";
import UserPageContent from "./UserPageContent";

export default async function UserPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/signin");

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      userPicture: users.userPicture,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) redirect("/signin");

  return (
    <UserPageContent
      username={user.username}
      email={user.email}
      userPicture={user.userPicture}
    />
  );
}
