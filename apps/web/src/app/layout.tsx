import "./globals.css";
import type { ReactNode } from "react";
import Providers from "../components/providers";
import Nav from "../components/nav";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-rta-bg text-rta-ink font-sans min-h-screen">
        <Providers>
          <Nav />
          <main className="max-w-[1200px] mx-auto px-6 py-7">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
