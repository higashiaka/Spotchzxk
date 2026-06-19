package com.spotchzxk.domain.user.repository;

import com.spotchzxk.domain.user.entity.UserItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserItemRepository extends JpaRepository<UserItem, Long> {
    List<UserItem> findByUserIdOrderByUpdatedAtDesc(String userId);
}
