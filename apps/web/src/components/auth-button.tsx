"use client";

import { useSession, signIn, signOut } from "next-auth/react";

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
        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-rta-accent to-rta-success inline-block shrink-0" />
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
