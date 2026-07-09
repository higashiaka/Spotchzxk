package com.spotchzxk.application;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AppStateService {

    private final JdbcTemplate jdbcTemplate;

    public Optional<String> get(String key) {
        List<String> values = jdbcTemplate.query(
                "SELECT state_value FROM app_state WHERE state_key = ?",
                (rs, rowNum) -> rs.getString(1),
                key
        );
        return values.stream().findFirst();
    }

    public boolean getBoolean(String key, boolean fallback) {
        return get(key)
                .map(String::trim)
                .map(value -> value.equalsIgnoreCase("true") || value.equals("1") || value.equalsIgnoreCase("yes"))
                .orElse(fallback);
    }

    public int getInt(String key, int fallback) {
        return get(key).map(String::trim).map(value -> {
            try {
                return Integer.parseInt(value);
            } catch (NumberFormatException e) {
                return fallback;
            }
        }).orElse(fallback);
    }

    public BigDecimal getDecimal(String key, BigDecimal fallback) {
        return get(key).map(String::trim).map(value -> {
            try {
                return new BigDecimal(value);
            } catch (NumberFormatException e) {
                return fallback;
            }
        }).orElse(fallback);
    }

    public Map<String, String> getByPrefix(String prefix) {
        List<Map.Entry<String, String>> rows = jdbcTemplate.query(
                "SELECT state_key, state_value FROM app_state WHERE state_key LIKE ? ORDER BY state_key",
                (rs, rowNum) -> Map.entry(rs.getString(1), rs.getString(2)),
                prefix + "%"
        );
        Map<String, String> result = new LinkedHashMap<>();
        rows.forEach(row -> result.put(row.getKey(), row.getValue()));
        return result;
    }

    @Transactional
    public void put(String key, String value) {
        jdbcTemplate.update("""
                INSERT INTO app_state (state_key, state_value)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP
                """, key, value);
    }
}
