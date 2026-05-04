"use client";

import { signIn, signOut, useSession } from "next-auth/react";

type AuthButtonProps = {
  connectLabel?: string;
  logoutLabel?: string;
  callbackUrl?: string;
};

export default function AuthButton({
  connectLabel = "Connexion",
  logoutLabel = "Log out",
  callbackUrl = "/profile"
}: AuthButtonProps) {
  const { status } = useSession();

  if (status === "loading") {
    return <button disabled>Chargement...</button>;
  }

  if (status === "authenticated") {
    return <button onClick={() => signOut({ callbackUrl: "/" })}>{logoutLabel}</button>;
  }

  return <button onClick={() => signIn("discord", { callbackUrl })}>{connectLabel}</button>;
}
