# Flyway migration notes

## `listed_at` repair migration

`V11__add_listed_at_to_stocks.sql` is the primary migration that adds `stocks.listed_at`.

`V13__repair_listed_at_column.sql` is intentionally defensive. It checks `information_schema` and only adds `stocks.listed_at` when the column is missing. In a normal database where V11 succeeded, V13 is a no-op. In an environment where V11 failed or was repaired before the column existed, V13 restores the expected schema before later migrations and application code rely on `listed_at`.

Do not remove V13 just because V11 exists; it documents and preserves compatibility with previously repaired Flyway histories.
