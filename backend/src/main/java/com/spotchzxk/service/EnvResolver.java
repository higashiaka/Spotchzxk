package com.spotchzxk.service;

import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Component
public class EnvResolver {

    public String get(String key) {
        String value = System.getenv(key);
        if (value != null && !value.isBlank()) {
            return value;
        }

        return readFromEnvFile(key);
    }

    private String readFromEnvFile(String key) {
        try {
            Path envPath = Paths.get("../frontend/.env");
            if (!Files.exists(envPath)) {
                envPath = Paths.get("frontend/.env");
            }
            if (!Files.exists(envPath)) {
                return null;
            }

            for (String line : Files.readAllLines(envPath)) {
                String trimmed = line.trim();
                if (trimmed.startsWith(key + "=")) {
                    return stripQuotes(trimmed.substring((key + "=").length()).trim());
                }
            }
        } catch (Exception ignored) {
            // Missing or unreadable local .env should not break service startup.
        }
        return null;
    }

    private String stripQuotes(String value) {
        if ((value.startsWith("\"") && value.endsWith("\""))
                || (value.startsWith("'") && value.endsWith("'"))) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }
}
