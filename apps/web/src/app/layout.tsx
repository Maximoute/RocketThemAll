import "./globals.css";
import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Providers from "../components/providers";
import Nav from "../components/nav";
import Footer from "../components/footer";

export const metadata: Metadata = {
  title: {
    default: "Rocket Them All",
    template: "%s"
  },
  description:
    "Jeu communautaire de collection et de progression connecté à Discord.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-rta-bg text-rta-ink font-sans min-h-screen flex flex-col">
        <Providers>
          <Suspense fallback={<div className="h-16 border-b border-rta-border bg-rta-surface" />}>
            <Nav />
          </Suspense>
          <main className="w-full max-w-[1200px] mx-auto px-6 py-7 flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
