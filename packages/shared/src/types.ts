export type RarityName =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Very Rare"
  | "Import"
  | "Exotic"
  | "Black Market"
  | "Limited";

export type DeckName = "Rocket League-like" | "Pop Culture" | "Pokemon";

export type TradeStatus = "pending" | "confirmed" | "cancelled" | "expired" | "completed";

export type ImportStatus =
  | "pending"
  | "downloaded"
  | "uploaded"
  | "approved"
  | "rejected"
  | "failed";
