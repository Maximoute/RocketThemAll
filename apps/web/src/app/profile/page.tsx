import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { getSpawnEnergySnapshot } from "../../lib/spawn-energy";
import { redirect } from "next/navigation";
import { FRAGMENT_CRAFT_COST, getUserFragmentBalances } from "../../lib/fragments";
import { getUserInventoryValue } from "../../lib/economy";

function formatDuration(ms: number | null) {
  if (ms === null || ms <= 0) {
    return "Aucune (charges pleines)";
  }

  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

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
  const energy = await getSpawnEnergySnapshot(user.id);
  const recentSpawns = await prisma.spawnLog.findMany({
    where: { userId: user.id },
    include: { card: true },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  const boosters = await prisma.userBooster.findMany({ where: { userId: user.id } });
  const boosterMap = new Map(boosters.map((b) => [b.boosterType, b.quantity]));
  const inventoryValue = await getUserInventoryValue(user.id);
  const transactions = await prisma.transactionLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 12
  });
  const fragmentBalances = await getUserFragmentBalances(user.id);

  return (
    <section className="card">
      <h1>Profil</h1>
      <p>Utilisateur: {user.username}</p>
      <p>Niveau: {user.level}</p>
      <p>XP: {user.xp} / {xpNeeded}</p>
      <p>Crédits: {user.credits}</p>
      <p>Fragments totaux: {user.fragments}</p>
      <p>Valeur inventaire estimée: {inventoryValue} crédits</p>
      <p style={{ color: "var(--muted)" }}>
        Règle craft fragments: {FRAGMENT_CRAFT_COST} fragments du tier inférieur = 1 carte du tier supérieur.
      </p>
      <ul>
        {fragmentBalances.map((row) => (
          <li key={row.rarityName}>{row.rarityName}: {row.quantity}</li>
        ))}
      </ul>
      <p>Boosters: basic {boosterMap.get("basic") ?? 0} | rare {boosterMap.get("rare") ?? 0} | epic {boosterMap.get("epic") ?? 0} | legendary {boosterMap.get("legendary") ?? 0}</p>
      <p>Charges /spawn : {energy.charges}/{energy.maxCharges}</p>
      <p>Temps avant prochaine recharge : {formatDuration(energy.nextChargeInMs)}</p>

      <h2>Historique économique</h2>
      {transactions.length === 0 ? (
        <p>Aucune transaction enregistrée.</p>
      ) : (
        <ul>
          {transactions.map((tx) => (
            <li key={tx.id}>
              {tx.createdAt.toLocaleString("fr-FR")} - {tx.type} - {tx.amount}
            </li>
          ))}
        </ul>
      )}

      <h2>Historique des spawns lancés</h2>
      {recentSpawns.length === 0 ? (
        <p>Aucun spawn lancé.</p>
      ) : (
        <ul>
          {recentSpawns.map((spawn) => (
            <li key={spawn.id}>
              {spawn.createdAt.toLocaleString("fr-FR")} - {spawn.spawnType} - {spawn.card.name} - {spawn.status}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


