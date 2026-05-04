"use client";

import AuthButton from "../../components/auth-button";

export default function LoginPage() {
  return (
    <section className="card">
      <h1>Connexion</h1>
      <p>Authentification Discord OAuth2.</p>
      <AuthButton connectLabel="Se connecter avec Discord" logoutLabel="Log out" callbackUrl="/profile" />
    </section>
  );
}
