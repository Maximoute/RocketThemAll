import { prisma } from "@rta/database";
import { adminUpdateSpawnCharges, getSpawnEnergySnapshot } from "../../../lib/spawn-energy";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";

function formatDuration(ms: number | null) {
  if (ms === null || ms <= 0) {
    return "Aucune (charges pleines)";
  }

  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: { q?: string; role?: string } }) {
  const currentAdmin = await requireAdmin();
  const q = (searchParams.q ?? "").trim();
  const roleFilter = searchParams.role ?? "all";

  async function toggleAdmin(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const nextValue = String(formData.get("nextValue") ?? "false") === "true";

    await prisma.user.update({
      where: { id: userId },
      data: { isAdmin: nextValue }
    });

    await prisma.adminLog.create({
      data: {
        adminId: currentAdmin.id,
        action: nextValue ? "USER_PROMOTED_ADMIN" : "USER_DEMOTED_ADMIN",
        target: userId
      }
    });

    revalidatePath("/admin/users");
  }

  async function setBooster(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const basicQuantity = Number(formData.get("basicQuantity") ?? 0);
    const rareQuantity = Number(formData.get("rareQuantity") ?? 0);
    const epicQuantity = Number(formData.get("epicQuantity") ?? 0);
    const legendaryQuantity = Number(formData.get("legendaryQuantity") ?? 0);
    const safeBasic = Number.isFinite(basicQuantity) ? Math.max(0, Math.floor(basicQuantity)) : 0;
    const safeRare = Number.isFinite(rareQuantity) ? Math.max(0, Math.floor(rareQuantity)) : 0;
    const safeEpic = Number.isFinite(epicQuantity) ? Math.max(0, Math.floor(epicQuantity)) : 0;
    const safeLegendary = Number.isFinite(legendaryQuantity) ? Math.max(0, Math.floor(legendaryQuantity)) : 0;

    await prisma.$transaction(async (tx) => {
      await tx.userBooster.upsert({
        where: { userId_boosterType: { userId, boosterType: "basic" } },
        update: { quantity: safeBasic },
        create: { userId, boosterType: "basic", quantity: safeBasic }
      });
      await tx.userBooster.upsert({
        where: { userId_boosterType: { userId, boosterType: "rare" } },
        update: { quantity: safeRare },
        create: { userId, boosterType: "rare", quantity: safeRare }
      });
      await tx.userBooster.upsert({
        where: { userId_boosterType: { userId, boosterType: "epic" } },
        update: { quantity: safeEpic },
        create: { userId, boosterType: "epic", quantity: safeEpic }
      });
      await tx.userBooster.upsert({
        where: { userId_boosterType: { userId, boosterType: "legendary" } },
        update: { quantity: safeLegendary },
        create: { userId, boosterType: "legendary", quantity: safeLegendary }
      });

      // Keep legacy row zeroed to avoid old/new stock divergence.
      await tx.booster.upsert({
        where: { userId },
        update: { basicQuantity: 0, rareQuantity: 0, epicQuantity: 0, quantity: 0 },
        create: { userId, basicQuantity: 0, rareQuantity: 0, epicQuantity: 0, quantity: 0 }
      });
    });

    await prisma.adminLog.create({
      data: {
        adminId: currentAdmin.id,
        action: "BOOSTER_QUANTITY_UPDATED",
        target: userId,
        metadata: { basicQuantity: safeBasic, rareQuantity: safeRare, epicQuantity: safeEpic, legendaryQuantity: safeLegendary }
      }
    });

    revalidatePath("/admin/users");
  }

  async function updateEconomy(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const credits = Math.max(0, Number(formData.get("credits") ?? 0));
    const fragments = Math.max(0, Number(formData.get("fragments") ?? 0));

    await prisma.user.update({ where: { id: userId }, data: { credits, fragments } });
    await prisma.adminLog.create({
      data: {
        adminId: currentAdmin.id,
        action: "USER_ECONOMY_UPDATED",
        target: userId,
        metadata: { credits, fragments }
      }
    });

    revalidatePath("/admin/users");
  }

  async function setSpawnCharges(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const quantity = Number(formData.get("quantity") ?? 0);

    const snapshot = await adminUpdateSpawnCharges(userId, quantity);

    await prisma.adminLog.create({
      data: {
        adminId: currentAdmin.id,
        action: "SPAWN_CHARGES_UPDATED",
        target: userId,
        metadata: { quantity: snapshot.charges }
      }
    });

    revalidatePath("/admin/users");
  }

  async function resetSpawnCharges(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const config = await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
    const snapshot = await adminUpdateSpawnCharges(userId, config.manualSpawnMaxCharges ?? 4);

    await prisma.adminLog.create({
      data: {
        adminId: currentAdmin.id,
        action: "SPAWN_CHARGES_RESET",
        target: userId,
        metadata: { quantity: snapshot.charges }
      }
    });

    revalidatePath("/admin/users");
  }

  async function giveCard(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId") ?? "").trim();
    const cardName = String(formData.get("cardName") ?? "").trim();
    const variant = String(formData.get("variant") ?? "normal") as "normal" | "shiny" | "holo";
    const quantityRaw = Number(formData.get("quantity") ?? 1);
    const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.floor(quantityRaw)) : 1;

    if (!userId || !cardName) return;

    const card = await prisma.card.findFirst({
      where: { name: { contains: cardName, mode: "insensitive" } }
    });
    if (!card) return;

    await prisma.inventoryItem.upsert({
      where: { userId_cardId_variant: { userId, cardId: card.id, variant } },
      update: { quantity: { increment: quantity } },
      create: { userId, cardId: card.id, variant, quantity }
    });

    await prisma.adminLog.create({
      data: {
        adminId: currentAdmin.id,
        action: "CARD_GIVEN",
        target: userId,
        metadata: { cardId: card.id, cardName: card.name, variant, quantity }
      }
    });

    revalidatePath("/admin/users");
  }

  const users = await prisma.user.findMany({
    where: {
      ...(q ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { discordId: { contains: q } }] } : {}),
      ...(roleFilter === "admin" ? { isAdmin: true } : {}),
      ...(roleFilter === "user" ? { isAdmin: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      userBoosters: true,
      spawnLogs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { card: true }
      },
      spawnChargeLogs: {
        orderBy: { createdAt: "desc" },
        take: 5
      },
      inventory: {
        select: {
          quantity: true
        }
      },
      _count: {
        select: {
          inventory: true,
          captureLogs: true
        }
      }
    }
  });

  return (
    <section>
      <h1 style={{ marginTop: 0, marginBottom: "4px" }}>👤 Gestion Utilisateurs</h1>
      <p style={{ color: "#6b5f4f", marginBottom: "16px" }}>Profils, rôles admin, boosters, économie, spawns. Voir inventaire via le lien dédié.</p>

      <div className="card" style={{ marginBottom: "16px" }}>
        <form method="GET" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Rechercher par nom ou Discord ID..."
            style={{ flex: 1, minWidth: "220px", padding: "8px 12px", border: "1px solid #e4d8c6", borderRadius: "8px" }}
          />
          <select name="role" defaultValue={roleFilter} style={{ padding: "8px 10px", border: "1px solid #e4d8c6", borderRadius: "8px" }}>
            <option value="all">Tous les rôles</option>
            <option value="admin">Admins seulement</option>
            <option value="user">Non-admins</option>
          </select>
          <button type="submit" style={{ padding: "8px 16px", background: "#d97706", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>🔍 Filtrer</button>
          {(q || roleFilter !== "all") && (
            <a href="/admin/users" style={{ padding: "8px 12px", color: "#6b5f4f", textDecoration: "none" }}>✕ Réinitialiser</a>
          )}
        </form>
        <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#6b5f4f" }}>{users.length} utilisateur(s) trouvé(s)</p>
      </div>
      {await Promise.all(users.map(async (user) => {
        const energy = await getSpawnEnergySnapshot(user.id);
        const boosterMap = new Map(user.userBoosters.map((b) => [b.boosterType, b.quantity]));
        return (
          <article key={user.id} className="card">
            <p><strong>{user.username}</strong> ({user.discordId})</p>
            <p>Lv.{user.level} | XP {user.xp}</p>
            <p>Admin: {user.isAdmin ? "oui" : "non"}</p>
            <p>Crédits: {user.credits} | Fragments: {user.fragments}</p>
            <p>Boosters: basic {boosterMap.get("basic") ?? 0} | rare {boosterMap.get("rare") ?? 0} | epic {boosterMap.get("epic") ?? 0} | legendary {boosterMap.get("legendary") ?? 0}</p>
            <p>Inventaire: {user._count.inventory} cartes uniques, {user.inventory.reduce((sum, i) => sum + i.quantity, 0)} cartes totales</p>
            <p>Captures: {user._count.captureLogs}</p>
            <p>Charges /spawn: {energy.charges}/{energy.maxCharges}</p>
            <p>Prochaine recharge: {formatDuration(energy.nextChargeInMs)}</p>
            <p><a href={`/admin/inventories?userId=${user.id}`}>Voir/Gerer inventaire</a></p>

            <form action={toggleAdmin} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="nextValue" value={String(!user.isAdmin)} />
              <button type="submit">{user.isAdmin ? "Retirer admin" : "Rendre admin"}</button>
            </form>

            <form action={setBooster} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="number" name="basicQuantity" min={0} defaultValue={boosterMap.get("basic") ?? 0} />
              <input type="number" name="rareQuantity" min={0} defaultValue={boosterMap.get("rare") ?? 0} />
              <input type="number" name="epicQuantity" min={0} defaultValue={boosterMap.get("epic") ?? 0} />
              <input type="number" name="legendaryQuantity" min={0} defaultValue={boosterMap.get("legendary") ?? 0} />
              <button type="submit">Mettre a jour boosters</button>
            </form>

            <form action={updateEconomy} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="number" name="credits" min={0} defaultValue={user.credits} />
              <input type="number" name="fragments" min={0} defaultValue={user.fragments} />
              <button type="submit">Mettre a jour économie</button>
            </form>

            <form action={setSpawnCharges} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="number" name="quantity" min={0} defaultValue={energy.charges} />
              <button type="submit">Mettre a jour charges /spawn</button>
            </form>

            <form action={resetSpawnCharges} style={{ marginBottom: "8px" }}>
              <input type="hidden" name="userId" value={user.id} />
              <button type="submit">Reset charges a max</button>
            </form>

            <form action={giveCard} style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="text" name="cardName" placeholder="Nom de la carte" required style={{ minWidth: "180px" }} />
              <select name="variant" style={{ padding: "4px 6px" }}>
                <option value="normal">Normal</option>
                <option value="shiny">Shiny ✨</option>
                <option value="holo">Holo 🌈</option>
              </select>
              <input type="number" name="quantity" min={1} defaultValue={1} style={{ width: "60px" }} />
              <button type="submit">🎁 Give carte</button>
            </form>

            <p><strong>Derniers spawns:</strong></p>
            <ul>
              {user.spawnLogs.length === 0 ? <li>Aucun</li> : user.spawnLogs.map((log) => (
                <li key={log.id}>{log.createdAt.toLocaleString("fr-FR")} - {log.card.name} - {log.status}</li>
              ))}
            </ul>

            <p><strong>Historique charges:</strong></p>
            <ul>
              {user.spawnChargeLogs.length === 0 ? <li>Aucun</li> : user.spawnChargeLogs.map((log) => (
                <li key={log.id}>{log.createdAt.toLocaleString("fr-FR")} - {log.action} ({log.chargesBefore} → {log.chargesAfter})</li>
              ))}
            </ul>
          </article>
        );
      }))}
    </section>
  );
}


