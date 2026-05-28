ALTER TABLE users
    ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users u
JOIN device_mappings d ON d.uid = u.id
SET u.is_guest = TRUE;
