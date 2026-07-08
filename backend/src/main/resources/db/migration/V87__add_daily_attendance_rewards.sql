ALTER TABLE users
    ADD COLUMN megaphone_tickets BIGINT NOT NULL DEFAULT 0;

CREATE TABLE daily_attendance_rewards (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(128) NOT NULL,
    attendance_date DATE NOT NULL,
    streak_day BIGINT NOT NULL,
    reward_type VARCHAR(32) NOT NULL,
    item_type VARCHAR(64) NULL,
    item_name VARCHAR(100) NULL,
    item_quantity BIGINT NOT NULL DEFAULT 0,
    reward_amount DECIMAL(65, 2) NOT NULL,
    claimed_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_daily_attendance_user_date (user_id, attendance_date),
    KEY idx_daily_attendance_user_date (user_id, attendance_date),
    CONSTRAINT fk_daily_attendance_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);
