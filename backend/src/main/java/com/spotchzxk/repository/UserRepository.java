package com.spotchzxk.repository;

import com.spotchzxk.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    @Query(value = "SELECT * FROM users WHERE is_bot = 0 ORDER BY realized_profit DESC LIMIT 50", nativeQuery = true)
    List<User> findTop50ByIsBotFalseOrderByRealizedProfitDesc();
}
