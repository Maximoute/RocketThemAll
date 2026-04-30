import "./globals.css";
import type { ReactNode } from "react";
import Providers from "../components/providers";
import Nav from "../components/nav";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>
          <Nav />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
