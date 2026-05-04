"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthButton from "./auth-button";

function cls(active: boolean) {
  return active ? "nav-link nav-link-active" : "nav-link";
}

export default function Nav() {
  const pathname = usePathname();
  const { status } = useSession();

  return (
    <header className="top-nav-wrap">
      <nav className="top-nav">
        <Link href="/" className={cls(pathname === "/")}>Accueil</Link>
        <Link href="/profile" className={cls(pathname.startsWith("/profile"))}>Profil</Link>
        <Link href="/inventory" className={cls(pathname.startsWith("/inventory"))}>Inventaire</Link>
        <Link href="/shop" className={cls(pathname.startsWith("/shop"))}>Boutique</Link>
        <Link href="/collection" className={cls(pathname.startsWith("/collection"))}>Collection</Link>
        <Link href="/trades" className={cls(pathname.startsWith("/trades"))}>Trades</Link>
        {status === "authenticated" ? <Link href="/admin" className={cls(pathname.startsWith("/admin"))}>Admin</Link> : null}
      </nav>
      <div className="top-nav-actions">
        <AuthButton connectLabel="Connexion" logoutLabel="Log out" callbackUrl="/profile" />
      </div>
    </header>
  );
}
