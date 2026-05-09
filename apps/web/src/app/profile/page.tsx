import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id && !session?.user?.name) {
    redirect("/login");
  }

  if (session.user?.id) {
    redirect(`/profiles/${session.user.id}`);
  }

  const user = await prisma.user.findFirst({ where: { username: session.user?.name ?? "" } });
  if (!user) {
    redirect("/login");
  }

  redirect(`/profiles/${user.discordId}`);
}


