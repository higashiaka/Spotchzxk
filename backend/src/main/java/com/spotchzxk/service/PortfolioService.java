package com.spotchzxk.service;

import com.spotchzxk.entity.User;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.entity.Order;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import com.spotchzxk.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PortfolioService {

    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);

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
        return Map.of("balance", p.getCoinBalance(), "shares", shares);
    }

    @Transactional
    public void resetPortfolio(String userId) {
        User p = getOrCreate(userId);
        p.setCoinBalance(INITIAL_BALANCE);
        userRepository.save(p);
        
        List<UserShare> shares = userShareRepository.findByUserId(userId);
        userShareRepository.deleteAll(shares);

        List<Order> orders = orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
        orderRepository.deleteAll(orders);
    }
}
