package com.spotchzxk.repository;

import com.spotchzxk.entity.UserDividendLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserDividendLogRepository extends JpaRepository<UserDividendLog, Long> {

    List<UserDividendLog> findTop50ByUserIdOrderByCreatedAtDesc(String userId);
}
