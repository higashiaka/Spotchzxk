ALTER TABLE users
    ADD COLUMN selected_title_id BIGINT NULL;

CREATE TABLE user_items (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(128) NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_item_type (user_id, item_type),
    INDEX idx_user_items_user_id (user_id)
);
