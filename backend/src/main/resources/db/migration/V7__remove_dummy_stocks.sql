-- Remove seeded dummy stocks that do not have a valid 32-character Chzzk hex channel ID format.
-- This keeps only the real, user-added Chzzk channels in the database.
DELETE FROM stocks WHERE LENGTH(channel_id) != 32;
