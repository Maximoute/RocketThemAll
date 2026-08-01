import { prisma } from "@rta/database";
import { AdminEconomyService } from "@rta/services";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const adminEconomyService = new AdminEconomyService();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARD_VARIANTS = new Set(["normal", "shiny", "holo"] as const);
const MAX_ADMIN_QUANTITY = 1_000_000;

function validUserId(value: FormDataEntryValue | null) {
  const id = String(value ?? "").trim();
  return UUID.test(id) ? id : null;
}

function boundedQuantity(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed)
    ? Math.min(MAX_ADMIN_QUANTITY, Math.max(0, parsed))
    : fallback;
}

export default async function AdminUsersPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<{ q?: string; role?: string; notice?: string; error?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const currentAdmin = await requireAdmin();
  const q = (searchParams.q ?? "").trim().slice(0, 64);
  const roleFilter = ["all", "admin", "user"].includes(searchParams.role ?? "")
    ? searchParams.role!
    : "all";

  async function toggleAdmin(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = validUserId(formData.get("userId"));
    const nextValue = String(formData.get("nextValue") ?? "false") === "true";
    if (!userId || (userId === admin.id && !nextValue)) return;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9842072702)`;
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true }
      });
      if (!target || target.isAdmin === nextValue) return;
      if (!nextValue && await tx.user.count({ where: { isAdmin: true } }) <= 1) return;
      await tx.user.update({ where: { id: userId }, data: { isAdmin: nextValue } });
      await tx.adminLog.create({
        data: {
          adminId: admin.id,
          action: nextValue ? "USER_PROMOTED_ADMIN" : "USER_DEMOTED_ADMIN",
          target: userId
        }
      });
    });

    revalidatePath("/admin/users");
  }

  async function toggleUnlimitedExplorations(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = validUserId(formData.get("userId"));
    const nextValue = String(formData.get("nextValue") ?? "false") === "true";
    if (!userId) return;

    await prisma.user.update({
      where: { id: userId },
      data: { unlimitedExplorations: nextValue }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: nextValue
          ? "USER_UNLIMITED_EXPLORATIONS_GRANTED"
          : "USER_UNLIMITED_EXPLORATIONS_REVOKED",
        target: userId
      }
    });

    revalidatePath("/admin/users");
  }

  async function setBooster(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = validUserId(formData.get("userId"));
    if (!userId) return;
    const safeBasic = boundedQuantity(formData.get("basicQuantity"));
    const safeRare = boundedQuantity(formData.get("rareQuantity"));
    const safeEpic = boundedQuantity(formData.get("epicQuantity"));
    const safeLegendary = boundedQuantity(formData.get("legendaryQuantity"));

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
        adminId: admin.id,
        action: "BOOSTER_QUANTITY_UPDATED",
        target: userId,
        metadata: { basicQuantity: safeBasic, rareQuantity: safeRare, epicQuantity: safeEpic, legendaryQuantity: safeLegendary }
      }
    });

    revalidatePath("/admin/users");
  }

  async function adjustEconomy(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = validUserId(formData.get("userId"));
    const creditDelta = Math.trunc(Number(formData.get("creditDelta") ?? 0));
    const fragmentDelta = Math.trunc(Number(formData.get("fragmentDelta") ?? 0));
    const reason = String(formData.get("reason") ?? "");
    if (!userId) redirect("/admin/users?error=Identifiant joueur invalide.");
    try {
      await adminEconomyService.adjustBalance({
        adminId: admin.id,
        userId,
        creditDelta,
        fragmentDelta,
        reason,
        operationKey: `admin:${admin.id}:balance:${randomUUID()}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ajustement impossible.";
      redirect(`/admin/users?error=${encodeURIComponent(message)}`);
    }
    revalidatePath("/admin/users");
    revalidatePath("/admin/economy");
    redirect("/admin/users?notice=Solde mis à jour et audité.");
  }

  async function grantXp(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = validUserId(formData.get("userId"));
    const xp = Math.trunc(Number(formData.get("xp") ?? 0));
    const reason = String(formData.get("reason") ?? "");
    if (!userId) redirect("/admin/users?error=Identifiant joueur invalide.");
    try {
      await adminEconomyService.grantXp({
        adminId: admin.id,
        userId,
        xp,
        reason,
        operationKey: `admin:${admin.id}:xp:${randomUUID()}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Don d’XP impossible.";
      redirect(`/admin/users?error=${encodeURIComponent(message)}`);
    }
    revalidatePath("/admin/users");
    redirect("/admin/users?notice=XP attribuée.");
  }

  async function grantItem(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = validUserId(formData.get("userId"));
    const itemKey = String(formData.get("itemKey") ?? "");
    const quantity = Math.trunc(Number(formData.get("quantity") ?? 1));
    const reason = String(formData.get("reason") ?? "");
    if (!userId) redirect("/admin/users?error=Identifiant joueur invalide.");
    try {
      await adminEconomyService.grantItem({
        adminId: admin.id,
        userId,
        itemKey,
        quantity,
        reason,
        operationKey: `admin:${admin.id}:item:${randomUUID()}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Don d’objet impossible.";
      redirect(`/admin/users?error=${encodeURIComponent(message)}`);
    }
    revalidatePath("/admin/users");
    revalidatePath("/admin/inventories");
    redirect("/admin/users?notice=Objet attribué.");
  }

  async function giveCard(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = validUserId(formData.get("userId"));
    const cardName = String(formData.get("cardName") ?? "").trim();
    const rawVariant = String(formData.get("variant") ?? "normal");
    const variant = CARD_VARIANTS.has(rawVariant as "normal" | "shiny" | "holo")
      ? rawVariant as "normal" | "shiny" | "holo"
      : null;
    const quantity = Math.max(1, boundedQuantity(formData.get("quantity"), 1));

    if (!userId || !cardName || cardName.length > 120 || !variant) return;

    const card = await prisma.card.findFirst({
      where: { name: { contains: cardName, mode: "insensitive" as const } }
    });
    if (!card) return;

    await prisma.inventoryItem.upsert({
      where: { userId_cardId_variant: { userId, cardId: card.id, variant } },
      update: { quantity: { increment: quantity } },
      create: { userId, cardId: card.id, variant, quantity }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CARD_GIVEN",
        target: userId,
        metadata: { cardId: card.id, cardName: card.name, variant, quantity }
      }
    });

    revalidatePath("/admin/users");
  }

  const [users, itemCatalog] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...(q ? { OR: [{ username: { contains: q, mode: "insensitive" as const } }, { discordId: { contains: q } }] } : {}),
        ...(roleFilter === "admin" ? { isAdmin: true } : {}),
        ...(roleFilter === "user" ? { isAdmin: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        userBoosters: true,
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
    }),
    prisma.itemDefinition.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ type: "asc" }, { name: "asc" }]
    })
  ]);

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight mb-1">Gestion Utilisateurs</h1>
      <p className="text-rta-muted text-sm mb-6">Profils, rôles admin, boosters et économie. Voir inventaire via le lien dédié.</p>

      {searchParams.notice && (
        <p className="card" style={{ borderColor: "#22c55e", color: "#166534" }}>
          {searchParams.notice}
        </p>
      )}
      {searchParams.error && (
        <p className="card" style={{ borderColor: "#ef4444", color: "#991b1b" }}>
          {searchParams.error}
        </p>
      )}

      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <form method="GET" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Rechercher par nom ou Discord ID..."
            className="bg-rta-bg border border-rta-border rounded-lg px-3 py-2 text-sm text-rta-ink placeholder:text-rta-muted flex-1 min-w-[220px] focus:outline-none focus:border-rta-accentHi"
          />
          <select name="role" defaultValue={roleFilter} className="bg-rta-bg border border-rta-border rounded-lg px-3 py-2 text-sm text-rta-ink focus:outline-none focus:border-rta-accentHi">
            <option value="all">Tous les rôles</option>
            <option value="admin">Admins seulement</option>
            <option value="user">Non-admins</option>
          </select>
          <button type="submit" className="px-4 py-2 rounded-lg bg-rta-cta text-rta-bg text-sm font-bold hover:bg-rta-cta/90 transition-colors">Filtrer</button>
          {(q || roleFilter !== "all") && (
            <a href="/admin/users" className="px-3 py-2 text-sm text-rta-muted hover:text-rta-ink transition-colors">Réinitialiser</a>
          )}
        </form>
        <p className="mt-2 text-xs text-rta-muted">{users.length} utilisateur(s) trouvé(s)</p>
      </div>
      {users.map((user) => {
        const boosterMap = new Map(user.userBoosters.map((b) => [b.boosterType, b.quantity]));
        return (
          <article key={user.id} className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
            <p><strong>{user.username}</strong> ({user.discordId})</p>
            <p>Lv.{user.level} | XP {user.xp}</p>
            <p>Admin: {user.isAdmin ? "oui" : "non"}</p>
            <p>Explorations illimitées: {user.unlimitedExplorations ? "oui" : "non"}</p>
            <p>Crédits: {user.credits} | Fragments: {user.fragments}</p>
            <p>Boosters: basic {boosterMap.get("basic") ?? 0} | rare {boosterMap.get("rare") ?? 0} | epic {boosterMap.get("epic") ?? 0} | legendary {boosterMap.get("legendary") ?? 0}</p>
            <p>Inventaire: {user._count.inventory} cartes uniques, {user.inventory.reduce((sum, i) => sum + i.quantity, 0)} cartes totales</p>
            <p>Captures: {user._count.captureLogs}</p>
            <p><a href={`/admin/inventories?userId=${user.id}`}>Voir/Gerer inventaire</a></p>

            <form action={toggleAdmin} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="nextValue" value={String(!user.isAdmin)} />
              <button
                type="submit"
                disabled={user.id === currentAdmin.id && user.isAdmin}
                title={user.id === currentAdmin.id && user.isAdmin
                  ? "Tu ne peux pas retirer tes propres droits admin."
                  : undefined}
              >
                {user.isAdmin ? "Retirer admin" : "Rendre admin"}
              </button>
            </form>

            <form action={toggleUnlimitedExplorations} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="nextValue" value={String(!user.unlimitedExplorations)} />
              <button type="submit">
                {user.unlimitedExplorations
                  ? "Retirer les explorations illimitées"
                  : "Donner les explorations illimitées"}
              </button>
            </form>

            <form action={setBooster} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="number" name="basicQuantity" min={0} defaultValue={boosterMap.get("basic") ?? 0} />
              <input type="number" name="rareQuantity" min={0} defaultValue={boosterMap.get("rare") ?? 0} />
              <input type="number" name="epicQuantity" min={0} defaultValue={boosterMap.get("epic") ?? 0} />
              <input type="number" name="legendaryQuantity" min={0} defaultValue={boosterMap.get("legendary") ?? 0} />
              <button type="submit">Mettre a jour boosters</button>
            </form>

            <form action={adjustEconomy} style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="number" name="creditDelta" defaultValue={0} placeholder="+/- crédits" required />
              <input type="number" name="fragmentDelta" defaultValue={0} placeholder="+/- fragments" required />
              <input type="text" name="reason" placeholder="Motif obligatoire" minLength={3} required />
              <button type="submit">Ajouter / retirer</button>
            </form>

            <form action={grantXp} style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="number" name="xp" min={1} defaultValue={100} required />
              <input type="text" name="reason" placeholder="Motif du gain d’XP" minLength={3} required />
              <button type="submit">Donner de l’XP</button>
            </form>

            <form action={grantItem} style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <input type="hidden" name="userId" value={user.id} />
              <select name="itemKey" required defaultValue="">
                <option value="" disabled>Choisir un objet</option>
                {itemCatalog.map((item) => (
                  <option key={item.id} value={item.contentKey}>
                    {item.name} · {item.type}
                  </option>
                ))}
              </select>
              <input type="number" name="quantity" min={1} defaultValue={1} required />
              <input type="text" name="reason" placeholder="Motif du don" minLength={3} required />
              <button type="submit">Donner l’objet</button>
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

          </article>
        );
      })}
    </div>
  );
}


