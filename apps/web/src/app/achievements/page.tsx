import { prisma } from "@rta/database";
import {
  AchievementService,
  AppError,
  DiscordAchievementRoleService,
  type AchievementCategory
} from "@rta/services";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../lib/guard";
import BadgeRoleSelector from "./badge-role-selector.client";

const achievementService = new AchievementService();
const discordAchievementRoleService = new DiscordAchievementRoleService();

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  EXPLORATION: "Exploration",
  COLLECTION: "Collection",
  PROGRESSION: "Progression",
  ECONOMY: "Économie",
  SOCIAL: "Social",
  CONTENT: "Contenu",
  SPECIAL: "Spécial"
};

type SearchParams = { badgeSuccess?: string; badgeError?: string };

export default async function AchievementsPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<SearchParams>;
}) {
  async function updateBadgeRoles(formData: FormData) {
    "use server";
    const user = await requireUser();
    const achievementIds = formData
      .getAll("achievementId")
      .map(String)
      .map((value) => value.trim())
      .filter(Boolean);
    let destination: string;
    try {
      await achievementService.setSelectedBadges(user.id, achievementIds);
      const result = await discordAchievementRoleService.syncUserBadges(
        user.id,
        process.env.DISCORD_TOKEN ?? ""
      );
      const names = result.selectedNames.length > 0
        ? result.selectedNames.join(", ")
        : "aucun badge";
      destination = `/achievements?badgeSuccess=${encodeURIComponent(
        `Rôles synchronisés sur ${result.guildName} : ${names}.`
      )}`;
    } catch (error) {
      const message = error instanceof AppError
        ? error.message
        : "La synchronisation Discord a échoué.";
      destination = `/achievements?badgeError=${encodeURIComponent(message)}`;
    }
    redirect(destination);
  }

  const [user, searchParams, primaryGuild] = await Promise.all([
    requireUser(),
    searchParamsPromise,
    prisma.guild.findFirst({
      where: { isPrimary: true, isActive: true },
      select: { name: true }
    })
  ]);
  const summary = await achievementService.getUserSummary(user.id);
  const grouped = summary.categoryCounts.map(({ category, total, unlocked }) => ({
    category,
    total,
    unlocked,
    achievements: summary.achievements.filter(
      (achievement) => achievement.category === category
    )
  }));

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-rta-cta font-bold mb-1">
            Progression permanente
          </p>
          <h1 className="text-3xl font-black tracking-tight">🏆 Achievements</h1>
          <p className="text-sm text-rta-muted mt-1">
            {summary.catalogCount} définitions stockées en BDD, dont {summary.templateCount} modèles
            générateurs. Les {summary.total} achievements jouables ci-dessous ne se réinitialisent jamais.
          </p>
        </div>
        <Link
          href="/profile"
          className="shrink-0 rounded-lg border border-rta-border bg-rta-surface px-3 py-2 text-sm font-bold text-rta-muted hover:text-rta-ink"
        >
          ← Profil
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { value: `${summary.unlocked}/${summary.total}`, label: "Débloqués", color: "text-rta-success" },
          { value: summary.points, label: "Points", color: "text-rta-gold" },
          { value: `${summary.completionPercent} %`, label: "Complétion", color: "text-purple-300" },
          { value: grouped.length, label: "Catégories", color: "text-rta-cta" }
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-rta-surface border border-rta-border rounded-xl p-4 text-center"
          >
            <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
            <div className="text-[0.65rem] uppercase tracking-widest text-rta-muted">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="h-3 bg-rta-bg rounded-full border border-rta-border overflow-hidden mb-6">
        <div
          className="h-full bg-gradient-to-r from-rta-accentHi via-rta-cta to-rta-success"
          style={{ width: `${summary.completionPercent}%` }}
        />
      </div>

      {searchParams.badgeSuccess && (
        <p className="mb-4 rounded-lg border border-rta-success/50 bg-rta-success/10 p-3 text-sm text-rta-success">
          ✅ {searchParams.badgeSuccess}
        </p>
      )}
      {searchParams.badgeError && (
        <p className="mb-4 rounded-lg border border-red-400/50 bg-red-400/10 p-3 text-sm text-red-200">
          {searchParams.badgeError}
        </p>
      )}

      <BadgeRoleSelector
        badges={summary.achievements
          .filter((achievement) => achievement.unlocked)
          .map((achievement) => ({
            id: achievement.id,
            name: achievement.name,
            category: achievement.category,
            tierLabel: achievement.tierLabel ?? `Palier ${achievement.tier}`
          }))}
        initialSelection={summary.selectedBadges.map((badge) => badge.id)}
        primaryGuildName={primaryGuild?.name ?? null}
        action={updateBadgeRoles}
      />

      <div className="space-y-4">
        {grouped.map((group) => (
          <details
            key={group.category}
            open
            className="bg-rta-surface border border-rta-border rounded-xl overflow-hidden"
          >
            <summary className="cursor-pointer px-4 py-3 font-black flex items-center justify-between gap-3 bg-rta-surface2/50">
              <span>{CATEGORY_LABELS[group.category]}</span>
              <span className="text-xs font-bold text-rta-muted">
                {group.unlocked}/{group.total}
              </span>
            </summary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
              {group.achievements.map((achievement) => {
                const secret = achievement.hidden && !achievement.unlocked;
                const percentage = Math.min(
                  100,
                  Math.round((achievement.progress / Math.max(1, achievement.target)) * 100)
                );
                return (
                  <article
                    key={achievement.id}
                    className={[
                      "rounded-xl border p-4",
                      achievement.unlocked
                        ? "border-rta-success/50 bg-rta-success/10"
                        : "border-rta-border bg-rta-bg/40"
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-black">
                          {achievement.unlocked ? "✅" : secret ? "🔒" : "▫️"}{" "}
                          {secret ? "Achievement secret" : achievement.name}
                        </p>
                        {!secret && (
                          <p className="text-xs text-rta-muted mt-0.5">
                            {achievement.tierLabel ?? `Palier ${achievement.tier}`} ·{" "}
                            {achievement.points} points
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-black text-rta-cta">
                        {achievement.progress}/{achievement.target}
                      </span>
                    </div>
                    <p className="text-xs text-rta-muted min-h-8 mb-3">
                      {secret
                        ? "Continue à jouer pour révéler cet achievement."
                        : achievement.readableObjective
                          ?? achievement.description
                          ?? "Progression permanente."}
                    </p>
                    <div className="h-2 bg-rta-bg rounded border border-rta-border overflow-hidden">
                      <div
                        className={[
                          "h-full rounded",
                          achievement.unlocked ? "bg-rta-success" : "bg-rta-cta"
                        ].join(" ")}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    {achievement.unlockedAt && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.65rem] text-rta-success">
                        <span>
                          Badge débloqué le {achievement.unlockedAt.toLocaleDateString("fr-FR")}
                        </span>
                        {achievement.selectedAsBadge && (
                          <span className="rounded-full border border-rta-gold/50 bg-rta-gold/10 px-2 py-0.5 font-black text-rta-gold">
                            🏅 Rôle affiché
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
