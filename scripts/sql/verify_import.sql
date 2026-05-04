SELECT COUNT(*) as total_cards FROM "Card";
SELECT source, COUNT(*) as count FROM "Card" GROUP BY source;
