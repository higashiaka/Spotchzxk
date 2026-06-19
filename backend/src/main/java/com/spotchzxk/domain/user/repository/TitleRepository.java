package com.spotchzxk.domain.user.repository;

import com.spotchzxk.domain.user.entity.Title;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TitleRepository extends JpaRepository<Title, Long> {
    List<Title> findByUserIdOrderByGrantedAtDesc(String userId);
    boolean existsByIdAndUserId(Long id, String userId);
}
