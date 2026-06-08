-- Fix incorrectly seeded streamer prices from 100 to 1000
UPDATE streamers SET price = 1000.00 WHERE price = 100.00;
