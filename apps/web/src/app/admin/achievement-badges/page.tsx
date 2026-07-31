import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";
import { fetchGuildRoles } from "../../../lib/discord-admin";

export default async function AdminAchievementBadgesPage() {
  await requireAdmin();
  const [primaryGuild, selectedCount, levelSyncCount, levelSyncErrors] = await Promise.all([
    prisma.guild.findFirst({
      where: { isPrimary: true, isActive: true },
      include: {
        achievementBadgeRoles: {
          include: { achievement: true },
          orderBy: { createdAt: "desc" }
        },
        levelRoles: { orderBy: { minLevel: "asc" } }
      }
    }),
    prisma.achievementBadgeSelection.count(),
    prisma.userLevelRoleSync.count({ where: { lastSyncedAt: { not: null } } }),
    prisma.userLevelRoleSync.count({ where: { lastError: { not: null } } })
  ]);
  const discordRoles = primaryGuild
    ? await fetchGuildRoles(primaryGuild.discordId)
    : [];
  const discordRoleById = new Map(discordRoles.map((role) => [role.id, role]));
  const linkedRoles = primaryGuild?.achievementBadgeRoles ?? [];
  const levelRoles = primaryGuild?.levelRoles ?? [];

  return (
    <section className="card">
      <h1>🏅 Badges et rôles de niveau</h1>
      <p>
        Chaque achievement débloqué peut être affiché comme rôle Discord. Un joueur peut
        en sélectionner trois simultanément, uniquement sur le serveur principal.
        Le rôle de niveau est automatique et suit une tranche de dix niveaux.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <article className="rounded-lg border border-rta-border p-3">
          <strong>{primaryGuild?.name ?? "Non configuré"}</strong>
          <p className="text-sm text-rta-muted">Serveur principal</p>
        </article>
        <article className="rounded-lg border border-rta-border p-3">
          <strong>{selectedCount}</strong>
          <p className="text-sm text-rta-muted">Sélections actives</p>
        </article>
        <article className="rounded-lg border border-rta-border p-3">
          <strong>{linkedRoles.length}</strong>
          <p className="text-sm text-rta-muted">Rôles de badges</p>
        </article>
        <article className="rounded-lg border border-rta-border p-3">
          <strong>{levelSyncCount}</strong>
          <p className="text-sm text-rta-muted">
            Niveaux synchronisés{levelSyncErrors > 0 ? ` · ${levelSyncErrors} erreurs` : ""}
          </p>
        </article>
      </div>

      <aside className="mt-4 rounded-lg border border-rta-gold/40 bg-rta-gold/10 p-3 text-sm">
        Le rôle du bot doit posséder <strong>Gérer les rôles</strong> et être placé au-dessus
        de tous les rôles commençant par 🏅. Les rôles RTA sont sans permission,
        non mentionnables et ne sont créés que lors de leur première sélection.
      </aside>

      <div className="flex flex-col">
      <div className="order-2">
      <h2 className="mt-8 text-xl font-black">🏅 Rôles de badges</h2>
      <p className="mt-1 text-sm text-rta-muted">
        Jusqu&apos;à trois badges sélectionnés par joueur, affichés sous son rôle de niveau.
      </p>
      {!primaryGuild ? (
        <p className="mt-4 text-red-300">
          Définis d&apos;abord un serveur principal dans Admin → Serveurs.
        </p>
      ) : linkedRoles.length === 0 ? (
        <p className="mt-4 text-rta-muted">
          Aucun rôle n&apos;a encore été créé. Le premier apparaîtra lorsqu&apos;un joueur
          synchronisera un badge.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rta-border text-rta-muted">
                <th className="p-2">Achievement</th>
                <th className="p-2">Rôle Discord</th>
                <th className="p-2">État</th>
                <th className="p-2">Créé</th>
              </tr>
            </thead>
            <tbody>
              {linkedRoles.map((mapping) => {
                const role = discordRoleById.get(mapping.discordRoleId);
                return (
                  <tr key={mapping.id} className="border-b border-rta-border/50">
                    <td className="p-2 font-bold">{mapping.achievement.name}</td>
                    <td className="p-2">{role?.name ?? mapping.discordRoleId}</td>
                    <td className="p-2">
                      {role ? (
                        <span className="text-rta-success">Présent</span>
                      ) : (
                        <span className="text-red-300">Supprimé ou inaccessible</span>
                      )}
                    </td>
                    <td className="p-2 text-rta-muted">
                      {mapping.createdAt.toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>

      <div className="order-1">
      <h2 className="mt-8 text-xl font-black">⭐ Rôles dynamiques de niveau</h2>
      <p className="mt-1 text-sm text-rta-muted">
        Tranches : 0–10, 11–20, 21–30, etc. Le bot vérifie la progression chaque minute,
        ajoute la nouvelle tranche et retire automatiquement l&apos;ancienne.
      </p>
      {levelRoles.length === 0 ? (
        <p className="mt-4 text-rta-muted">
          Aucun rôle de niveau créé pour le moment. Ils sont créés à la demande.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rta-border text-rta-muted">
                <th className="p-2">Tranche</th>
                <th className="p-2">Rôle Discord</th>
                <th className="p-2">État</th>
                <th className="p-2">Créé</th>
              </tr>
            </thead>
            <tbody>
              {levelRoles.map((mapping) => {
                const role = discordRoleById.get(mapping.discordRoleId);
                return (
                  <tr key={mapping.id} className="border-b border-rta-border/50">
                    <td className="p-2 font-bold">
                      Niveau {mapping.minLevel}–{mapping.maxLevel}
                    </td>
                    <td className="p-2">{role?.name ?? mapping.discordRoleId}</td>
                    <td className="p-2">
                      {role ? (
                        <span className="text-rta-success">Présent</span>
                      ) : (
                        <span className="text-red-300">Supprimé ou inaccessible</span>
                      )}
                    </td>
                    <td className="p-2 text-rta-muted">
                      {mapping.createdAt.toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
      </div>
    </section>
  );
}
