package com.spotchzxk.application;

import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@RequiredArgsConstructor
public class RankCacheService {

    private static final long RANK_CACHE_TTL_MS  = 3  * 60 * 1_000L;
    private static final long TOTAL_CACHE_TTL_MS = 10 * 60 * 1_000L;

    private final UserRepository userRepository;

    private final Map<String, long[]> rankCache = new ConcurrentHashMap<>();
    private volatile long[] totalActiveCache;

    public long getCachedRank(String userId) {
        long now = System.currentTimeMillis();
        long[] entry = rankCache.compute(userId, (key, current) -> {
            if (current != null && now < current[1]) return current;
            long rank = userRepository.countUsersWithHigherTotalAssets(key) + 1;
            return new long[]{rank, now + RANK_CACHE_TTL_MS};
        });
        return entry[0];
    }

    public long getCachedTotal() {
        long[] entry = totalActiveCache;
        if (entry != null && System.currentTimeMillis() < entry[1]) return entry[0];
        long total = userRepository.countActiveUsers();
        totalActiveCache = new long[]{total, System.currentTimeMillis() + TOTAL_CACHE_TTL_MS};
        return total;
    }

    /** Evict a user's cached rank — call after any event that changes total asset value. */
    public void evict(String userId) {
        rankCache.remove(userId);
    }
}
