package com.spotchzxk.repository;

import com.spotchzxk.entity.MegaphonePost;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface MegaphonePostRepository extends JpaRepository<MegaphonePost, String> {

    long countByUserIdAndCreatedAtBetween(String userId, LocalDateTime start, LocalDateTime end);

    @Query("""
            SELECT p
            FROM MegaphonePost p
            JOIN Stock s ON s.channelId = p.channelId
            WHERE s.isLive = true
            ORDER BY p.createdAt DESC
            """)
    List<MegaphonePost> findLivePosts(Pageable pageable);
}
