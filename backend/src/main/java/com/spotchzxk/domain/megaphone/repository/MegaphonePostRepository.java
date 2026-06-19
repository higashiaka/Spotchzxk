package com.spotchzxk.domain.megaphone.repository;

import com.spotchzxk.domain.megaphone.entity.MegaphonePost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface MegaphonePostRepository extends JpaRepository<MegaphonePost, String> {

    long countByUserIdAndCreatedAtBetween(String userId, LocalDateTime start, LocalDateTime end);

    /** Returns the 20 most recent megaphone posts for currently live stocks,
     *  filtered to the current live session (live_session_started_at matches stock's live_started_at). */
    /** Returns the 20 most recent megaphone posts for currently live stocks,
     *  filtered to the current live session (live_session_started_at matches stock's live_started_at).
     *  COLLATE utf8mb4_unicode_ci normalises the channel_id join when tables use different collations. */
    @Query(value = """
            SELECT mp.*
            FROM megaphone_posts mp
            JOIN stocks s ON mp.channel_id = s.channel_id COLLATE utf8mb4_unicode_ci
            WHERE s.is_live = TRUE
              AND mp.live_session_started_at = s.live_started_at
            ORDER BY mp.created_at DESC
            LIMIT 20
            """, nativeQuery = true)
    List<MegaphonePost> findRecentPostsForLiveStocks();
}


