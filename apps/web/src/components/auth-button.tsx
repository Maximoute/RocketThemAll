"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import DiscordAvatar from "./discord-avatar";

type Props = { connectLabel: string; logoutLabel: string; callbackUrl?: string };

export default function AuthButton({ connectLabel, logoutLabel, callbackUrl }: Props) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="w-24 h-8 rounded-md bg-rta-surface2 animate-pulse" />;
  }

  if (session) {
    return (
      <button
        onClick={() => signOut()}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold text-rta-cta border border-rta-cta bg-rta-cta/10 hover:bg-rta-cta/20 transition-colors"
      >
        <span className="h-6 w-6 overflow-hidden rounded-full border border-rta-cta/50 shrink-0">
          <DiscordAvatar
            avatarUrl={session.user?.image}
            discordId={session.user?.discordId}
            username={session.user?.name ?? "Joueur"}
            size={24}
          />
        </span>
        {session.user?.name ?? logoutLabel}
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn("discord", { callbackUrl })}
      className="px-3 py-1.5 rounded-md text-sm font-bold text-rta-bg bg-rta-cta hover:bg-rta-cta/90 transition-colors"
    >
      {connectLabel}
    </button>
  );
}
