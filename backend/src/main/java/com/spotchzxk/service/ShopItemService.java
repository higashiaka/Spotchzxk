package com.spotchzxk.service;

import com.spotchzxk.entity.User;
import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ShopItemService {

    private static final BigDecimal NICKNAME_TICKET_PRICE = new BigDecimal("1000000");
    private static final BigDecimal STOCK_ADD_TICKET_PRICE = new BigDecimal("10000000");

    private final UserRepository userRepository;
    private final TradeEngine tradeEngine;

    @Transactional
    public Map<String, Object> purchase(String uid, String item) {
        User user = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));

        BigDecimal price = switch (item) {
            case "nickname-change-ticket" -> NICKNAME_TICKET_PRICE;
            case "stock-add-ticket" -> STOCK_ADD_TICKET_PRICE;
            default -> throw new IllegalArgumentException("알 수 없는 상품입니다.");
        };

        if (user.getCoinBalance().compareTo(price) < 0) {
            throw new IllegalStateException("잔액이 부족합니다.");
        }

        user.deductBalance(price);
        if ("nickname-change-ticket".equals(item)) {
            user.addNicknameTicket();
        } else {
            user.addStockAddTicket();
        }
        userRepository.save(user);
        tradeEngine.evictUserCache(uid);

        return Map.of(
                "balance", user.getCoinBalance(),
                "nicknameChangeTickets", user.getNicknameChangeTickets(),
                "stockAddTickets", user.getStockAddTickets()
        );
    }
}
