SELECT COUNT(*) as total FROM "Card" WHERE source = 'pokeapi';
SELECT COUNT(*) as shiny_count FROM "Card" WHERE source = 'pokeapi' AND name LIKE '%✨%';
SELECT name FROM "Card" WHERE source = 'pokeapi' ORDER BY name LIMIT 30;
