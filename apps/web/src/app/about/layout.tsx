import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "À Propos | Rocket Them All",
  description:
    "Découvrez Rocket Them All - un bot Discord révolutionnaire pour collectionner des cartes, trader avec d'autres joueurs et progresser dans un système d'économie de jeu unique. Système de spawn, boosters, échanges sécurisés et bien plus!",
  keywords: [
    "Discord Bot",
    "Card Collector",
    "Trading Game",
    "Collection",
    "RPG",
  ],
  authors: [{ name: "Rocket Them All Team" }],
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://rocketthemall.com",
    siteName: "Rocket Them All",
    title: "À Propos | Rocket Them All",
    description: "Le bot Discord ultime pour collectionner des cartes et trader",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Rocket Them All",
      },
    ],
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
