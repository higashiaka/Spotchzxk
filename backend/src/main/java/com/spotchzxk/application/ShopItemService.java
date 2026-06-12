package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@Service
@RequiredArgsConstructor
public class ShopItemService {

    private static final BigDecimal NICKNAME_TICKET_PRICE = new BigDecimal("1000000");
    private static final BigDecimal STOCK_ADD_TICKET_PRICE = new BigDecimal("10000000");

    private final UserRepository userRepository;
    private final TradeEngine tradeEngine;
    private final TransactionTemplate transactionTemplate;

    public Map<String, Object> purchase(String uid, String item) {
        AtomicReference<Map<String, Object>> result = new AtomicReference<>();
        tradeEngine.runWithUserLock(uid, () -> result.set(transactionTemplate.execute(status ->
                purchaseLocked(uid, item))));
        return result.get();
    }

    private Map<String, Object> purchaseLocked(String uid, String item) {
        User user = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));

        // Issue #16: accept both snake_case (nickname_ticket, stock_ticket) and kebab-case API aliases
        BigDecimal price = switch (item) {
            case "nickname-change-ticket", "nickname_ticket" -> NICKNAME_TICKET_PRICE;
            case "stock-add-ticket", "stock_ticket" -> STOCK_ADD_TICKET_PRICE;
            default -> throw new IllegalArgumentException("존재하지 않는 상품입니다.");
        };

        if (user.getCoinBalance().compareTo(price) < 0) {
            throw new IllegalStateException("잔고가 부족합니다.");
        }

        if (userRepository.addToBalance(uid, price.negate()) != 1) {
            throw new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
        }

        boolean isNicknameTicket = "nickname-change-ticket".equals(item) || "nickname_ticket".equals(item);
        if (isNicknameTicket) {
            if (userRepository.addNicknameTicket(uid) != 1) {
                throw new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
            }
        } else if (userRepository.addStockAddTicket(uid) != 1) {
            throw new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
        }

        tradeEngine.evictUserCache(uid);

        User updated = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));
        return Map.of(
                "balance", updated.getCoinBalance(),
                "nicknameChangeTickets", updated.getNicknameChangeTickets(),
                "stockAddTickets", updated.getStockAddTickets()
        );
    }
}


