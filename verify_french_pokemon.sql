SELECT COUNT(*) as total FROM "Card" WHERE source = 'pokeapi';
SELECT name FROM "Card" WHERE source = 'pokeapi' ORDER BY name LIMIT 20;
