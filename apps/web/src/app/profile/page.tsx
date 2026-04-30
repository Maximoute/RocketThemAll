import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    redirect("/login");
  }

  const user = await prisma.user.findFirst({ where: { username: session.user.name } });
  if (!user) {
    return <section className="card">Utilisateur introuvable</section>;
  }

  const xpNeeded = Math.floor(100 * Math.pow(user.level, 1.5));

  return (
    <section className="card">
      <h1>Profil</h1>
      <p>Utilisateur: {user.username}</p>
      <p>Niveau: {user.level}</p>
      <p>XP: {user.xp} / {xpNeeded}</p>
      <p>Boosters: {(await prisma.booster.findUnique({ where: { userId: user.id } }))?.quantity ?? 0}</p>
    </section>
  );
}


