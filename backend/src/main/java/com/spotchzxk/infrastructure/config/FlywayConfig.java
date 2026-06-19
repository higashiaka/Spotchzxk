package com.spotchzxk.infrastructure.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@Slf4j
public class FlywayConfig {

    @Value("${flyway.repair-on-start:false}")
    private boolean repairOnStart;

    @Bean
    public FlywayMigrationStrategy repairAndMigrate() {
        return flyway -> {
            if (repairOnStart) {
                log.warn("Flyway repair() enabled via flyway.repair-on-start — use only for local troubleshooting.");
                flyway.repair();
            }
            flyway.migrate();
        };
    }
}


