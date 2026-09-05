import "./globals.css";
import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Providers from "../components/providers";
import Nav from "../components/nav";
import Footer from "../components/footer";
import { getAuthSession } from "../lib/guard";
import { isRtaDevelopmentRequest } from "../lib/environment";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const isDevelopment = isRtaDevelopmentRequest(requestHeaders.get("host"));

  return {
    title: {
      default: isDevelopment ? "Rocket Them All — Development" : "Rocket Them All",
      template: "%s",
    },
    description:
      "Jeu communautaire de collection et de progression connecté à Discord.",
    icons: {
      icon: "/favicon.png",
      apple: "/favicon.png",
    },
    ...(isDevelopment
      ? { robots: { index: false, follow: false, noarchive: true } }
      : {}),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const isDevelopment = isRtaDevelopmentRequest(requestHeaders.get("host"));
  const session = await getAuthSession();

  return (
    <html lang="fr">
      <body className="bg-rta-bg text-rta-ink font-sans min-h-screen flex flex-col">
        <Providers session={session}>
          <Suspense fallback={<div className="h-16 border-b border-rta-border bg-rta-surface" />}>
            <Nav isDevelopment={isDevelopment} />
          </Suspense>
          <main className="w-full max-w-[1320px] mx-auto px-4 sm:px-6 py-7 flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
