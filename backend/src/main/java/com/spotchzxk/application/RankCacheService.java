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
    private final Object totalActiveCacheLock = new Object();
    private volatile long[] totalActiveCache;

    public long getCachedRank(String userId) {
        long now = System.currentTimeMillis();
        long[] cached = rankCache.get(userId);
        if (cached != null && now < cached[1]) {
            return cached[0];
        }

        long rank = userRepository.countUsersWithHigherTotalAssets(userId) + 1;
        long[] fresh = new long[]{rank, System.currentTimeMillis() + RANK_CACHE_TTL_MS};
        rankCache.put(userId, fresh);
        return rank;
    }

    public long getCachedTotal() {
        long now = System.currentTimeMillis();
        long[] entry = totalActiveCache;
        if (entry != null && now < entry[1]) return entry[0];

        synchronized (totalActiveCacheLock) {
            now = System.currentTimeMillis();
            entry = totalActiveCache;
            if (entry != null && now < entry[1]) return entry[0];
            long total = userRepository.countActiveUsers();
            totalActiveCache = new long[]{total, System.currentTimeMillis() + TOTAL_CACHE_TTL_MS};
            return total;
        }
    }

    /** Evict a user's cached rank — call after any event that changes total asset value. */
    public void evict(String userId) {
        rankCache.remove(userId);
    }
}
