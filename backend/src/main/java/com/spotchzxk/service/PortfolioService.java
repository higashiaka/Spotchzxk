package com.spotchzxk.service;

import com.spotchzxk.entity.User;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.entity.Order;
import com.spotchzxk.exception.ResetLimitExceededException;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import com.spotchzxk.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PortfolioService {

    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);
    private static final int MAX_DAILY_RESETS = 3;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final OrderRepository orderRepository;

    @Transactional
    public User getOrCreate(String userId) {
        return userRepository.findById(userId).orElseGet(() -> {
            User p = User.builder().id(userId).coinBalance(INITIAL_BALANCE).build();
            return userRepository.save(p);
        });
    }

    public Map<String, Object> getPortfolioResponse(String userId) {
        User p = getOrCreate(userId);
        List<UserShare> userShares = userShareRepository.findByUserId(userId);
        Map<String, Long> shares = userShares.stream()
                .filter(s -> s.getQuantity() > 0)
                .collect(Collectors.toMap(
                        s -> s.getStock().getChannelId(),
                        s -> s.getQuantity()
                ));
        Map<String, BigDecimal> avgPrices = userShares.stream()
                .filter(s -> s.getQuantity() > 0)
                .collect(Collectors.toMap(
                        s -> s.getStock().getChannelId(),
                        s -> s.getAvgPrice() != null ? s.getAvgPrice() : BigDecimal.ZERO
                ));
        return Map.of("balance", p.getCoinBalance(), "shares", shares, "avgPrices", avgPrices);
    }

    @Transactional
    public void resetPortfolio(String userId) {
        User p = getOrCreate(userId);

        LocalDate todayKst = LocalDate.now(KST);
        if (!todayKst.equals(p.getLastResetDate())) {
            p.setResetCount(0);
            p.setLastResetDate(todayKst);
        }

        if (p.getResetCount() >= MAX_DAILY_RESETS) {
            throw new ResetLimitExceededException();
        }

        p.setResetCount(p.getResetCount() + 1);
        p.setCoinBalance(INITIAL_BALANCE);
        userRepository.save(p);

        List<UserShare> shares = userShareRepository.findByUserId(userId);
        userShareRepository.deleteAll(shares);

        List<Order> orders = orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
        orderRepository.deleteAll(orders);
    }

    public int getRemainingResets(String userId) {
        User p = getOrCreate(userId);
        LocalDate todayKst = LocalDate.now(KST);
        if (!todayKst.equals(p.getLastResetDate())) {
            return MAX_DAILY_RESETS;
        }
        return Math.max(0, MAX_DAILY_RESETS - p.getResetCount());
    }
}
