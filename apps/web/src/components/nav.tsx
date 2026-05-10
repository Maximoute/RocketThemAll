"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthButton from "./auth-button";

function cls(active: boolean, variant?: "profile") {
  const classes = ["nav-link"];
  if (active) {
    classes.push("nav-link-active");
  }
  if (variant === "profile") {
    classes.push("nav-link-profile");
  }
  return classes.join(" ");
}

export default function Nav() {
  const pathname = usePathname();
  const { status, data: session } = useSession();
  const profileHref = session?.user?.id ? `/profiles/${session.user.id}` : "/profile";

  return (
    <header className="top-nav-wrap">
      <nav className="top-nav">
        <Link href="/" className={cls(pathname === "/")}>Accueil</Link>
        <Link href="/about" className={cls(pathname === "/about")}>À Propos</Link>
        <Link href={profileHref} className={cls(pathname.startsWith("/profile") || pathname.startsWith("/profiles"), "profile")}>Mon Profil</Link>
        <Link href="/inventory" className={cls(pathname.startsWith("/inventory"))}>Inventaire</Link>
        <Link href="/shop" className={cls(pathname.startsWith("/shop"))}>Boutique</Link>
        <Link href="/collection" className={cls(pathname.startsWith("/collection"))}>Decks</Link>
        <Link href="/trades" className={cls(pathname.startsWith("/trades"))}>Trades</Link>
        {status === "authenticated" && session?.user?.isAdmin ? <Link href="/admin" className={cls(pathname.startsWith("/admin"))}>Admin</Link> : null}
      </nav>
      <div className="top-nav-actions">
        <AuthButton connectLabel="Connexion" logoutLabel="Log out" callbackUrl="/profile" />
      </div>
    </header>
  );
}
