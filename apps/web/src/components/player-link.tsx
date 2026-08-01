"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

type PlayerLinkProps = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & {
  href: string;
};

/**
 * A link to a player-only page.
 *
 * Next.js normally prefetches visible links. Waiting for the authenticated
 * session here prevents anonymous visitors from triggering profile, inventory
 * or shop route requests before they have signed in.
 */
export default function PlayerLink({ href, ...props }: PlayerLinkProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  return (
    <Link
      {...props}
      href={isAuthenticated ? href : "/login"}
      prefetch={isAuthenticated}
    />
  );
}
