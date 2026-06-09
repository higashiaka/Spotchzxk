package com.spotchzxk.service;

import com.spotchzxk.config.GuestAbuseProperties;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class GuestAbuseProtectionService {

    private static final String KEY_PREFIX = "abuse:";

    private final GuestAbuseProperties properties;
    private final StringRedisTemplate redisTemplate;
    private final Map<String, LocalCounter> localCounters = new ConcurrentHashMap<>();
    private final Map<String, LocalPermit> localPermits = new ConcurrentHashMap<>();

    public AbuseCheckResult checkAndRecord(HttpServletRequest request, String fingerprintHash) {
        if (!properties.enabled()) {
            return AbuseCheckResult.permitted();
        }

        String key = abuseKey(request, fingerprintHash);
        if (key.isBlank()) {
            return AbuseCheckResult.permitted();
        }

        try {
            return checkAndRecordWithRedis(key);
        } catch (RedisConnectionFailureException e) {
            log.warn("Redis unavailable for guest abuse check; using local fallback: {}", e.getMessage());
            return checkAndRecordLocally(key);
        }
    }

    private AbuseCheckResult checkAndRecordWithRedis(String key) {
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1) {
            redisTemplate.expire(key, Duration.ofSeconds(properties.windowSeconds()));
        }

        if (count != null && count >= properties.maxNewGuestsPerWindow()) {
            Long ttl = redisTemplate.getExpire(key);
            return AbuseCheckResult.blocked(ttl != null && ttl > 0 ? ttl : properties.blockSeconds());
        }

        return AbuseCheckResult.permitted();
    }

    public String createPrecheckPermit(HttpServletRequest request, String fingerprintHash) {
        String abuseKey = abuseKey(request, fingerprintHash);
        if (abuseKey.isBlank()) {
            return "";
        }
        String token = UUID.randomUUID().toString();
        String key = permitKey(token);
        try {
            redisTemplate.opsForValue().set(key, abuseKey, Duration.ofSeconds(60));
        } catch (RedisConnectionFailureException e) {
            localPermits.put(token, new LocalPermit(abuseKey, Instant.now().getEpochSecond() + 60));
        }
        return token;
    }

    public boolean consumePrecheckPermit(String token, HttpServletRequest request, String fingerprintHash) {
        if (token == null || token.isBlank()) {
            return false;
        }
        String expectedAbuseKey = abuseKey(request, fingerprintHash);
        if (expectedAbuseKey.isBlank()) {
            return false;
        }
        String normalized = token.trim();
        String key = permitKey(normalized);
        try {
            String storedAbuseKey = redisTemplate.opsForValue().get(key);
            if (!expectedAbuseKey.equals(storedAbuseKey)) {
                return false;
            }
            redisTemplate.delete(key);
            return true;
        } catch (RedisConnectionFailureException e) {
            LocalPermit permit = localPermits.remove(normalized);
            return permit != null
                    && expectedAbuseKey.equals(permit.abuseKey)
                    && permit.expiresAt >= Instant.now().getEpochSecond();
        }
    }

    private AbuseCheckResult checkAndRecordLocally(String key) {
        long now = Instant.now().getEpochSecond();
        LocalCounter counter = localCounters.compute(key, (counterKey, current) -> {
            if (current == null || current.expiresAt <= now) {
                return new LocalCounter(1, now + properties.windowSeconds());
            }
            return new LocalCounter(current.count + 1, current.expiresAt);
        });

        if (counter.count >= properties.maxNewGuestsPerWindow()) {
            return AbuseCheckResult.blocked(Math.max(1, counter.expiresAt - now));
        }

        return AbuseCheckResult.permitted();
    }

    private String clientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (isTrustedProxy(remoteAddr)) {
            String forwardedFor = request.getHeader("X-Forwarded-For");
            if (forwardedFor != null && !forwardedFor.isBlank()) {
                return forwardedFor.split(",")[0].trim();
            }
            String realIp = request.getHeader("X-Real-IP");
            if (realIp != null && !realIp.isBlank()) {
                return realIp.trim();
            }
        }
        return remoteAddr;
    }

    private String networkKey(String ip) {
        if (ip == null || ip.isBlank()) {
            return "";
        }
        String normalized = ip.trim().toLowerCase(Locale.ROOT);
        if (normalized.contains(":")) {
            String[] parts = normalized.split(":");
            StringBuilder prefix = new StringBuilder();
            int limit = Math.min(4, parts.length);
            for (int i = 0; i < limit; i++) {
                if (i > 0) prefix.append(':');
                prefix.append(parts[i]);
            }
            return prefix + "::/64";
        }

        String[] octets = normalized.split("\\.");
        if (octets.length != 4) {
            return normalized;
        }
        return octets[0] + "." + octets[1] + "." + octets[2] + ".0/24";
    }

    private String normalizeFingerprint(String fingerprintHash) {
        if (fingerprintHash == null) {
            return "";
        }
        return fingerprintHash.trim().replaceAll("[^A-Za-z0-9_-]", "");
    }

    private String abuseKey(HttpServletRequest request, String fingerprintHash) {
        String network = networkKey(clientIp(request));
        String fingerprint = normalizeFingerprint(fingerprintHash);
        if (network.isBlank() || fingerprint.isBlank()) {
            return "";
        }
        return KEY_PREFIX + network + ":" + fingerprint;
    }

    private String permitKey(String token) {
        return KEY_PREFIX + "permit:" + token;
    }

    private boolean isTrustedProxy(String remoteAddr) {
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return false;
        }
        for (String cidr : properties.trustedProxyCidrs()) {
            if (matchesCidr(remoteAddr, cidr)) {
                return true;
            }
        }
        return false;
    }

    private boolean matchesCidr(String ip, String cidr) {
        if (cidr == null || cidr.isBlank()) {
            return false;
        }
        String[] parts = cidr.trim().split("/", 2);
        try {
            InetAddress address = InetAddress.getByName(ip);
            InetAddress network = InetAddress.getByName(parts[0]);
            byte[] addressBytes = address.getAddress();
            byte[] networkBytes = network.getAddress();
            if (addressBytes.length != networkBytes.length) {
                return false;
            }

            int prefixLength = parts.length == 2 ? Integer.parseInt(parts[1]) : addressBytes.length * 8;
            if (prefixLength < 0 || prefixLength > addressBytes.length * 8) {
                return false;
            }

            int fullBytes = prefixLength / 8;
            int remainingBits = prefixLength % 8;
            for (int i = 0; i < fullBytes; i++) {
                if (addressBytes[i] != networkBytes[i]) {
                    return false;
                }
            }
            if (remainingBits == 0) {
                return true;
            }
            int mask = 0xFF << (8 - remainingBits);
            return (addressBytes[fullBytes] & mask) == (networkBytes[fullBytes] & mask);
        } catch (NumberFormatException | UnknownHostException e) {
            log.warn("Ignoring invalid trusted proxy CIDR '{}': {}", cidr, e.getMessage());
            return false;
        }
    }

    private record LocalCounter(long count, long expiresAt) {
    }

    private record LocalPermit(String abuseKey, long expiresAt) {
    }

    public record AbuseCheckResult(boolean allowed, long retryAfterSeconds) {
        public static AbuseCheckResult permitted() {
            return new AbuseCheckResult(true, 0);
        }

        public static AbuseCheckResult blocked(long retryAfterSeconds) {
            return new AbuseCheckResult(false, retryAfterSeconds);
        }
    }
}
