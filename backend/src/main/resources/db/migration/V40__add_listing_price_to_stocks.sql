ALTER TABLE stocks
    ADD COLUMN listing_price INT NOT NULL DEFAULT 10000;

UPDATE stocks
SET listing_price = GREATEST(
    10000,
    LEAST(
        300000,
        FLOOR((SQRT(GREATEST(COALESCE(follower_count, 0), 0)) * 300) / 1000) * 1000
    )
);
