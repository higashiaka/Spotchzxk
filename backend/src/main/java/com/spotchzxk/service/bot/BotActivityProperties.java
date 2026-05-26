package com.spotchzxk.service.bot;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "bot.activity")
public class BotActivityProperties {

    private boolean enabled = false;
    private int minDelaySeconds = 20;
    private int maxDelaySeconds = 45;
    private int maxOrdersPerTick = 1;
    private int userCount = 20;
    private int maxQuantity = 12;
    private int buyChancePercent = 60;
    private int smallQuantityMax = 5;
    private int largeQuantityChancePercent = 15;
    private int lowBalanceThresholdPercent = 30;
    private int criticalBalanceThresholdPercent = 10;
    private int lowBalanceBuyChancePercent = 25;
    private int lowBalanceQuantityPercent = 50;
    private int highHoldingQuantity = 30;
    private int highHoldingBuyChancePercent = 20;

    @PostConstruct
    public void validate() {
        if (lowBalanceThresholdPercent < criticalBalanceThresholdPercent) {
            throw new IllegalStateException(
                    "bot.activity.low-balance-threshold-percent (" + lowBalanceThresholdPercent +
                    ") must be >= critical-balance-threshold-percent (" + criticalBalanceThresholdPercent + ")");
        }
    }
}
