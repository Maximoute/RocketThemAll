"use client";

import { useState } from "react";

type BadgeOption = {
  id: string;
  name: string;
  category: string;
  tierLabel: string;
};

export default function BadgeRoleSelector({
  badges,
  initialSelection,
  primaryGuildName,
  action
}: {
  badges: BadgeOption[];
  initialSelection: string[];
  primaryGuildName: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [slots, setSlots] = useState<string[]>([
    initialSelection[0] ?? "",
    initialSelection[1] ?? "",
    initialSelection[2] ?? ""
  ]);

  return (
    <form
      action={action}
      className="mb-6 rounded-xl border border-rta-gold/40 bg-rta-gold/10 p-4"
    >
      <div className="mb-3">
        <h2 className="text-lg font-black text-rta-gold">🏅 Badges Discord</h2>
        <p className="mt-1 text-xs text-rta-muted">
          Chaque achievement débloqué devient un badge. Choisis jusqu&apos;à trois badges :
          le bot synchronisera les rôles correspondants uniquement sur le serveur principal
          {primaryGuildName ? ` « ${primaryGuildName} »` : ""}.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {slots.map((value, index) => (
          <label key={index} className="grid gap-1 text-xs font-bold text-rta-muted">
            Badge {index + 1}
            <select
              name="achievementId"
              value={value}
              onChange={(event) => {
                const next = [...slots];
                next[index] = event.target.value;
                setSlots(next);
              }}
              className="rounded-lg border border-rta-border bg-rta-bg px-3 py-2 text-sm text-rta-ink"
            >
              <option value="">Aucun badge</option>
              {badges.map((badge) => (
                <option
                  key={badge.id}
                  value={badge.id}
                  disabled={slots.some(
                    (selectedId, slotIndex) => slotIndex !== index && selectedId === badge.id
                  )}
                >
                  {badge.name} · {badge.tierLabel}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={!primaryGuildName || badges.length === 0}
        className="mt-4 rounded-lg bg-rta-cta px-4 py-2 text-sm font-black text-rta-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        Synchroniser mes 3 rôles
      </button>
      {!primaryGuildName && (
        <p className="mt-2 text-xs font-bold text-red-300">
          Aucun serveur principal actif n&apos;est configuré dans le panel admin.
        </p>
      )}
    </form>
  );
}
