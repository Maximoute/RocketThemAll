-- Delete Pokémon cards to reimport with French names
DELETE FROM "Card" WHERE source = 'pokeapi';

-- Verify deletion
SELECT COUNT(*) as remaining_cards FROM "Card";
SELECT source, COUNT(*) as count FROM "Card" GROUP BY source;
