package com.spotchzxk.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "app.guest-abuse")
public record GuestAbuseProperties(
        boolean enabled,
        long windowSeconds,
        long maxNewGuestsPerWindow,
        long blockSeconds,
        List<String> trustedProxyCidrs
) {
    public GuestAbuseProperties {
        if (windowSeconds <= 0) windowSeconds = 180;
        if (maxNewGuestsPerWindow <= 0) maxNewGuestsPerWindow = 5;
        if (blockSeconds <= 0) blockSeconds = 600;
        if (trustedProxyCidrs == null || trustedProxyCidrs.isEmpty()) {
            trustedProxyCidrs = List.of(
                    "127.0.0.1/32",
                    "::1/128",
                    "10.0.0.0/8",
                    "172.16.0.0/12",
                    "192.168.0.0/16"
            );
        }
    }
}
