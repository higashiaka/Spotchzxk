ALTER TABLE users
    ADD COLUMN reset_count   INT  NOT NULL DEFAULT 0,
    ADD COLUMN last_reset_date DATE NULL;
