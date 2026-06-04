package com.spotchzxk.service.system;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "system-sell.pressure")
public class SystemSellPressureProperties {

    private boolean enabled = false;
    private int maxOrdersPerTick = 2;
    private int executionChancePercent = 80;

    private int startGainMinPercent = 250;
    private int startGainMaxPercent = 400;
    private int stopGainMinPercent = 120;
    private int stopGainMaxPercent = 220;
    private int stateTtlMinHours = 6;
    private int stateTtlMaxHours = 24;

    private int highPriceTriggerMin = 800_000;
    private int highPriceTriggerMax = 1_400_000;
    private int highPriceStopRatioMinPercent = 65;
    private int highPriceStopRatioMaxPercent = 90;
    private int highPriceReferenceDivisorMin = 8;
    private int highPriceReferenceDivisorMax = 15;

    private Tier weak = new Tier(5, 30, 45, 120);
    private Tier medium = new Tier(30, 120, 20, 75);
    private Tier strong = new Tier(100, 350, 8, 35);
    private Tier extreme = new Tier(250, 1_000, 4, 18);

    private int maxQuantityPerOrder = 1_000;
    private int dailySellLimitMin = 1_000;
    private int dailySellLimitMax = 5_000;
    private int maxConsecutiveSellMin = 3;
    private int maxConsecutiveSellMax = 7;
    private int cooldownMinSeconds = 60;
    private int cooldownMaxSeconds = 300;

    @PostConstruct
    public void validate() {
        if (startGainMinPercent > startGainMaxPercent) {
            throw new IllegalStateException("system-sell.pressure start gain min must be <= max");
        }
        if (stopGainMinPercent > stopGainMaxPercent) {
            throw new IllegalStateException("system-sell.pressure stop gain min must be <= max");
        }
        if (stopGainMaxPercent >= startGainMinPercent) {
            throw new IllegalStateException("system-sell.pressure stop gain max must be lower than start gain min");
        }
        if (highPriceTriggerMin > highPriceTriggerMax) {
            throw new IllegalStateException("system-sell.pressure high price trigger min must be <= max");
        }
        if (highPriceStopRatioMinPercent > highPriceStopRatioMaxPercent) {
            throw new IllegalStateException("system-sell.pressure high price stop ratio min must be <= max");
        }
        if (highPriceReferenceDivisorMin < 1 || highPriceReferenceDivisorMin > highPriceReferenceDivisorMax) {
            throw new IllegalStateException("system-sell.pressure high price reference divisor range is invalid");
        }
        if (maxQuantityPerOrder < 1) {
            throw new IllegalStateException("system-sell.pressure max quantity per order must be >= 1");
        }
        weak.validate("weak");
        medium.validate("medium");
        strong.validate("strong");
        extreme.validate("extreme");
    }

    @Getter
    @Setter
    public static class Tier {
        private int quantityMin;
        private int quantityMax;
        private int intervalMinSeconds;
        private int intervalMaxSeconds;

        public Tier() {
        }

        public Tier(int quantityMin, int quantityMax, int intervalMinSeconds, int intervalMaxSeconds) {
            this.quantityMin = quantityMin;
            this.quantityMax = quantityMax;
            this.intervalMinSeconds = intervalMinSeconds;
            this.intervalMaxSeconds = intervalMaxSeconds;
        }

        private void validate(String name) {
            if (quantityMin < 1 || quantityMin > quantityMax) {
                throw new IllegalStateException("system-sell.pressure." + name + " quantity range is invalid");
            }
            if (intervalMinSeconds < 1 || intervalMinSeconds > intervalMaxSeconds) {
                throw new IllegalStateException("system-sell.pressure." + name + " interval range is invalid");
            }
        }
    }
}
