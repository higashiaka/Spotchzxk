ALTER TABLE users
    ADD COLUMN nickname_change_tickets INT NOT NULL DEFAULT 0,
    ADD COLUMN stock_add_tickets INT NOT NULL DEFAULT 0;
