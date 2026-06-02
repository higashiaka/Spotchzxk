package com.spotchzxk.repository;

import com.spotchzxk.entity.MegaphonePost;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

@Repository
public interface MegaphonePostRepository extends JpaRepository<MegaphonePost, String> {

    long countByUserIdAndCreatedAtBetween(String userId, LocalDateTime start, LocalDateTime end);

    List<MegaphonePost> findByChannelIdInOrderByCreatedAtDesc(Collection<String> channelIds, Pageable pageable);
}
