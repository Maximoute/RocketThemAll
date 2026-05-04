import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { prisma } from "@rta/database";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email && !session?.user?.name) {
    redirect("/login");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  const username = session.user?.name ?? "";
  const user = await prisma.user.findFirst({ where: { username } });
  if (!user?.isAdmin) {
    redirect("/profile");
  }
  return user;
}

