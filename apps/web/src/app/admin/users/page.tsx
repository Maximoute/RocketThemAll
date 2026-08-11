import Link from "next/link";
import { randomUUID } from "node:crypto";
import { prisma } from "@rta/database";
import { AdminEconomyService } from "@rta/services";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import DiscordAvatar from "../../../components/discord-avatar";
import { requireAdmin } from "../../../lib/guard";

const adminEconomyService = new AdminEconomyService();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function userIdFrom(formData: FormData) {
  const value = String(formData.get("userId") ?? "").trim();
  return UUID.test(value) ? value : null;
}

export default async function AdminUsersPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<{ q?: string; role?: string; notice?: string; error?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const currentAdmin = await requireAdmin();
  const q = (searchParams.q ?? "").trim().slice(0, 64);
  const role = ["all", "admin", "user"].includes(searchParams.role ?? "")
    ? searchParams.role!
    : "all";

  async function quickBalance(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = userIdFrom(formData);
    const creditDelta = Math.trunc(Number(formData.get("creditDelta") ?? 0));
    const fragmentDelta = Math.trunc(Number(formData.get("fragmentDelta") ?? 0));
    if (!userId || !Number.isSafeInteger(creditDelta) || !Number.isSafeInteger(fragmentDelta)) {
      redirect("/admin/users?error=Ajustement invalide");
    }
    let errorMessage = "";
    try {
      await adminEconomyService.adjustBalance({
        adminId: admin.id,
        userId,
        creditDelta,
        fragmentDelta,
        reason: "Ajustement rapide depuis la carte joueur",
        operationKey: `admin:${admin.id}:quick-balance:${randomUUID()}`
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Ajustement impossible";
    }
    if (errorMessage) redirect(`/admin/users?error=${encodeURIComponent(errorMessage)}`);
    revalidatePath("/admin/users");
    redirect("/admin/users?notice=Solde mis à jour et audité");
  }

  async function toggleAdmin(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = userIdFrom(formData);
    const nextValue = String(formData.get("nextValue") ?? "false") === "true";
    if (!userId || (userId === admin.id && !nextValue)) return;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9842072702)`;
      const target = await tx.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
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

  async function toggleUnlimited(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = userIdFrom(formData);
    const nextValue = String(formData.get("nextValue") ?? "false") === "true";
    if (!userId) return;
    await prisma.user.update({ where: { id: userId }, data: { unlimitedExplorations: nextValue } });
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: nextValue ? "USER_UNLIMITED_EXPLORATIONS_GRANTED" : "USER_UNLIMITED_EXPLORATIONS_REVOKED",
        target: userId
      }
    });
    revalidatePath("/admin/users");
  }

  const users = await prisma.user.findMany({
    where: {
      ...(q ? {
        OR: [
          { username: { contains: q, mode: "insensitive" as const } },
          { discordId: { contains: q } }
        ]
      } : {}),
      ...(role === "admin" ? { isAdmin: true } : {}),
      ...(role === "user" ? { isAdmin: false } : {})
    },
    orderBy: [{ isAdmin: "desc" }, { createdAt: "desc" }],
    include: {
      inventory: { select: { quantity: true } },
      items: { where: { quantity: { gt: 0 } }, select: { quantity: true } },
      _count: { select: { inventory: true, captureLogs: true, achievements: true } }
    },
    take: 200
  });

  const buttonClass = "rounded-lg border border-rta-border bg-rta-bg px-2.5 py-1.5 text-xs font-bold text-rta-ink transition hover:border-rta-cta hover:text-rta-cta";

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-black tracking-tight">Joueurs</h1>
          <p className="text-sm text-rta-muted">Une vue rapide ici, tous les outils détaillés dans chaque profil.</p>
        </div>
        <span className="rounded-full border border-rta-border bg-rta-surface px-3 py-1 text-xs text-rta-muted">
          {users.length} joueur(s)
        </span>
      </div>

      {searchParams.notice && <p className="mb-4 rounded-xl border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-300">{searchParams.notice}</p>}
      {searchParams.error && <p className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{searchParams.error}</p>}

      <form method="GET" className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-rta-border bg-rta-surface p-4">
        <input name="q" defaultValue={q} placeholder="Pseudo ou identifiant Discord…" className="min-w-[240px] flex-1 rounded-lg border px-3 py-2 text-sm" />
        <select name="role" defaultValue={role} className="rounded-lg border px-3 py-2 text-sm">
          <option value="all">Tous les joueurs</option>
          <option value="admin">Administrateurs</option>
          <option value="user">Non-administrateurs</option>
        </select>
        <button className="rounded-lg bg-rta-cta px-4 py-2 text-sm font-black text-rta-bg">Rechercher</button>
        {(q || role !== "all") && <Link href="/admin/users" className="px-2 text-sm text-rta-muted hover:text-rta-ink">Effacer</Link>}
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        {users.map((user) => {
          const totalCards = user.inventory.reduce((sum, row) => sum + row.quantity, 0);
          return (
            <article key={user.id} className="rounded-2xl border border-rta-border bg-rta-surface p-4 shadow-lg shadow-black/10">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-rta-accentHi bg-rta-bg">
                  <DiscordAvatar avatarUrl={user.avatarUrl} discordId={user.discordId} username={user.username} size={56} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-black">{user.username}</h2>
                    {user.isAdmin && <span className="rounded-full bg-rta-cta/15 px-2 py-0.5 text-[10px] font-black uppercase text-rta-cta">Admin</span>}
                    {user.unlimitedExplorations && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-violet-300">∞ explorations</span>}
                  </div>
                  <p className="truncate text-xs text-rta-muted">Discord {user.discordId}</p>
                </div>
                <Link href={`/admin/users/${user.id}`} className="rounded-lg bg-rta-accent px-3 py-2 text-xs font-black text-white hover:bg-rta-accentHi">Ouvrir le profil</Link>
              </div>

              <div className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-rta-bg p-2"><p className="text-[10px] uppercase text-rta-muted">Niveau</p><p className="font-black">{user.level}</p></div>
                <div className="rounded-lg bg-rta-bg p-2"><p className="text-[10px] uppercase text-rta-muted">Crédits</p><p className="font-black text-rta-cta">{user.credits.toLocaleString("fr-FR")}</p></div>
                <div className="rounded-lg bg-rta-bg p-2"><p className="text-[10px] uppercase text-rta-muted">Cartes</p><p className="font-black">{totalCards}</p></div>
                <div className="rounded-lg bg-rta-bg p-2"><p className="text-[10px] uppercase text-rta-muted">Objets</p><p className="font-black">{user.items.length}</p></div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-rta-border pt-3">
                <span className="mr-1 text-xs text-rta-muted">Actions rapides :</span>
                {[100, 1000].map((amount) => (
                  <form action={quickBalance} key={amount}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="creditDelta" value={amount} />
                    <input type="hidden" name="fragmentDelta" value="0" />
                    <button className={buttonClass}>+ {amount.toLocaleString("fr-FR")} crédits</button>
                  </form>
                ))}
                <Link href={`/admin/users/${user.id}#give-card`} className={buttonClass}>+ carte</Link>
                <form action={toggleUnlimited}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="nextValue" value={String(!user.unlimitedExplorations)} />
                  <button className={buttonClass}>{user.unlimitedExplorations ? "Retirer ∞" : "Donner ∞"}</button>
                </form>
                <form action={toggleAdmin}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="nextValue" value={String(!user.isAdmin)} />
                  <button className={buttonClass} disabled={user.id === currentAdmin.id && user.isAdmin}>
                    {user.isAdmin ? "Retirer admin" : "+ admin"}
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
