"use client";

import AuthButton from "../../components/auth-button";

export default function LoginPage() {
  return (
    <section className="max-w-lg mx-auto bg-rta-surface border border-rta-border rounded-xl p-6 shadow-[0_0_28px_rgba(72,28,166,0.25)]">
      <div className="text-4xl mb-4">🚀</div>
      <h1 className="text-2xl font-black tracking-tight mb-1">Connexion</h1>
      <p className="text-rta-muted text-sm mb-5">Authentification Discord OAuth2.</p>
      <AuthButton connectLabel="Se connecter avec Discord" logoutLabel="Log out" callbackUrl="/profile" />
    </section>
  );
}
