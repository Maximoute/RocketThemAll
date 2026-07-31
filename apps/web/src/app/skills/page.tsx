import { randomUUID } from "node:crypto";
import { AppError, SkillService } from "@rta/services";
import { redirect } from "next/navigation";
import { requireUser } from "../../lib/guard";

const skillService = new SkillService();

type SearchParams = { error?: string; success?: string };

const branchPresentation = {
  EXPLORER: {
    label: "Explorateur",
    icon: "🧭",
    description: "Lecture des routes, maîtrise des expéditions et anticipation."
  },
  HUNTER: {
    label: "Chasseur",
    icon: "🎯",
    description: "Capture, précision, combos et maîtrise des rencontres."
  },
  COLLECTOR: {
    label: "Collectionneur",
    icon: "💎",
    description: "Collection, recyclage, artisanat et échanges sociaux."
  }
} as const;

function grantedItemName(effectParams: unknown) {
  if (!effectParams || typeof effectParams !== "object" || Array.isArray(effectParams)) return null;
  const value = (effectParams as Record<string, unknown>).grantedItemName;
  return typeof value === "string" && value ? value : null;
}

export default async function SkillsPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [user, searchParams] = await Promise.all([requireUser(), searchParamsPromise]);
  const tree = await skillService.getTree(user.id);

  async function unlockSkill(formData: FormData) {
    "use server";

    const actionUser = await requireUser();
    const contentKey = String(formData.get("contentKey") ?? "");
    const operationKey = String(formData.get("operationKey") ?? "");
    try {
      await skillService.unlockSkill(actionUser.id, contentKey, operationKey);
    } catch (error) {
      const message = error instanceof AppError || error instanceof Error
        ? error.message
        : "Déblocage impossible";
      redirect(`/skills?error=${encodeURIComponent(message)}`);
    }
    redirect(`/skills?success=${encodeURIComponent(`${contentKey} débloquée`)}`);
  }

  const commitment = tree.state?.committedSpecialization ?? null;
  const learnedCount = tree.definitions.filter((node) => node.learned).length;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Arbres de compétences</h1>
          <p className="text-rta-muted text-sm mt-1">
            {tree.definitions.length} nœuds officiels · 1 point gagné par niveau
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-rta-surface border border-rta-border rounded-xl px-5 py-3 text-center">
            <div className="text-[0.65rem] uppercase tracking-widest text-rta-muted">Débloquées</div>
            <div className="text-2xl font-black text-rta-success">{learnedCount} / 45</div>
          </div>
          <div className="bg-rta-surface border border-rta-cta/70 rounded-xl px-5 py-3 text-center">
            <div className="text-[0.65rem] uppercase tracking-widest text-rta-muted">Points libres</div>
            <div className="text-2xl font-black text-rta-cta">{tree.progress.unspentSkillPoints}</div>
          </div>
        </div>
      </div>

      {commitment && (
        <div className="mb-5 rounded-xl border border-rta-gold/60 bg-rta-gold/10 p-3 text-sm text-rta-gold">
          Spécialisation engagée : <strong>{commitment}</strong>. Termine son troisième palier pour en choisir une autre.
          Les nœuds communs restent accessibles.
        </div>
      )}
      {searchParams.error && (
        <div className="mb-5 rounded-xl border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}
      {searchParams.success && (
        <div className="mb-5 rounded-xl border border-rta-success/60 bg-rta-success/10 p-3 text-sm text-rta-success">
          {searchParams.success}
        </div>
      )}

      <div className="space-y-10">
        {Object.entries(branchPresentation).map(([branch, presentation]) => {
          const nodes = tree.definitions.filter((node) => node.branch === branch);
          const common = nodes.filter((node) => node.kind === "COMMON");
          const specializationNames = [...new Set(
            nodes.map((node) => node.specialization).filter((value): value is string => Boolean(value))
          )];
          return (
            <section key={branch} className="bg-rta-surface border border-rta-border rounded-2xl p-5 sm:p-6">
              <div className="flex items-start gap-4 mb-6">
                <span className="text-4xl">{presentation.icon}</span>
                <div>
                  <h2 className="text-2xl font-black">{presentation.label}</h2>
                  <p className="text-sm text-rta-muted">{presentation.description}</p>
                </div>
              </div>

              <div className="mb-7">
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-rta-cta mb-3">
                  Tronc commun
                </h3>
                <div className="grid gap-3 md:grid-cols-3">
                  {common.map((node) => (
                    <SkillNodeCard
                      key={node.contentKey}
                      node={node}
                      points={tree.progress.unspentSkillPoints}
                      commitment={commitment}
                      action={unlockSkill}
                    />
                  ))}
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-3">
                {specializationNames.map((specialization) => {
                  const path = nodes.filter((node) => node.specialization === specialization);
                  return (
                    <div key={specialization} className="rounded-xl border border-rta-border bg-rta-bg/40 p-4">
                      <h3 className="font-black text-rta-gold mb-3">{specialization}</h3>
                      <div className="space-y-3">
                        {path.map((node, index) => (
                          <div key={node.contentKey}>
                            {index > 0 && <div className="mx-auto h-3 w-px bg-rta-border" />}
                            <SkillNodeCard
                              node={node}
                              points={tree.progress.unspentSkillPoints}
                              commitment={commitment}
                              action={unlockSkill}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SkillNodeCard({
  node,
  points,
  commitment,
  action
}: {
  node: Awaited<ReturnType<SkillService["getTree"]>>["definitions"][number];
  points: number;
  commitment: string | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const commitmentAllows = node.kind === "COMMON"
    || (node.kind === "SPECIALIZATION_UPGRADE" && (!commitment || commitment === node.specialization))
    || (node.kind === "SPECIALIZATION_GATE" && !commitment);
  const available = !node.learned
    && node.prerequisitesMet
    && points >= node.cost
    && commitmentAllows;
  const missingPoints = !node.learned && node.prerequisitesMet && points < node.cost;
  const itemName = grantedItemName(node.effectParams);
  const border = node.learned
    ? "border-rta-success bg-rta-success/10"
    : available
      ? "border-rta-cta bg-rta-cta/5"
      : "border-rta-border bg-rta-surface2/60";

  return (
    <article className={`rounded-xl border p-3.5 ${border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span>{node.learned ? "✅" : available ? "🔓" : "🔒"}</span>
            <h4 className="font-bold text-sm">{node.name}</h4>
          </div>
          <p className="text-[0.68rem] text-rta-muted mt-1">
            {node.contentKey} · {node.kind === "SPECIALIZATION_GATE" ? "Porte" : `Palier ${node.tier}`}
          </p>
        </div>
        <span className="rounded-full border border-rta-border px-2 py-0.5 text-xs text-rta-gold">
          {node.cost} pt
        </span>
      </div>
      <p className="text-xs text-rta-muted leading-relaxed mt-3">{node.description}</p>
      {itemName && (
        <p className="text-xs text-rta-cta mt-2">Objet accordé : {itemName}</p>
      )}
      {!node.learned && (
        <div className="mt-3">
          {available ? (
            <form action={action}>
              <input type="hidden" name="contentKey" value={node.contentKey} />
              <input type="hidden" name="operationKey" value={`web-${randomUUID()}`} />
              <button
                type="submit"
                className="w-full rounded-lg bg-rta-cta px-3 py-1.5 text-xs font-black text-rta-bg hover:bg-rta-cta/90"
              >
                Débloquer
              </button>
            </form>
          ) : (
            <p className="text-[0.68rem] text-rta-muted">
              {missingPoints
                ? "Point de compétence requis"
                : commitment && node.kind !== "COMMON" && node.specialization !== commitment
                  ? `Termine ${commitment}`
                  : node.prerequisiteKeys.length
                    ? `Prérequis : ${node.prerequisiteKeys.join(", ")}`
                    : "Non disponible"}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
