import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";

export default async function AdminUsersPage() {
  const currentAdmin = await requireAdmin();

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
    const quantity = Number(formData.get("quantity") ?? 0);
    const safeQty = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;

    await prisma.booster.upsert({
      where: { userId },
      update: { quantity: safeQty },
      create: { userId, quantity: safeQty }
    });

    await prisma.adminLog.create({
      data: {
        adminId: currentAdmin.id,
        action: "BOOSTER_QUANTITY_UPDATED",
        target: userId,
        metadata: { quantity: safeQty }
      }
    });

    revalidatePath("/admin/users");
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      boosters: true,
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
    <section className="card">
      <h1>Admin Users Manager</h1>
      <p>Gestion des profils, roles admin et boosters. Utilise le lien inventaire pour gerer les cartes d'un utilisateur.</p>
      {users.map((user) => (
        <article key={user.id} className="card">
          <p><strong>{user.username}</strong> ({user.discordId})</p>
          <p>Lv.{user.level} | XP {user.xp}</p>
          <p>Admin: {user.isAdmin ? "oui" : "non"}</p>
          <p>Boosters: {user.boosters?.quantity ?? 0}</p>
          <p>Inventaire: {user._count.inventory} cartes uniques, {user.inventory.reduce((sum, i) => sum + i.quantity, 0)} cartes totales</p>
          <p>Captures: {user._count.captureLogs}</p>
          <p><a href={`/admin/inventories?userId=${user.id}`}>Voir/Gerer inventaire</a></p>

          <form action={toggleAdmin} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="nextValue" value={String(!user.isAdmin)} />
            <button type="submit">{user.isAdmin ? "Retirer admin" : "Rendre admin"}</button>
          </form>

          <form action={setBooster} style={{ display: "flex", gap: "8px" }}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="number" name="quantity" min={0} defaultValue={user.boosters?.quantity ?? 0} />
            <button type="submit">Mettre a jour boosters</button>
          </form>
        </article>
      ))}
    </section>
  );
}


