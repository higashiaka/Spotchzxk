package com.spotchzxk.repository;

import com.spotchzxk.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 ORDER BY realized_profit DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50ByIsBotFalseOrderByRealizedProfitDesc();

    @Query(value = "SELECT * FROM users WHERE is_bot = 0 AND is_guest = 0 ORDER BY dividend_total DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50ByIsBotFalseOrderByDividendTotalDesc();

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE users SET realized_profit = 0, dividend_total = 0 WHERE is_bot = 0", nativeQuery = true)
    int resetAllRankingStats();
}
