package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.entity.Title;
import com.spotchzxk.domain.user.entity.UserItem;
import com.spotchzxk.domain.user.entity.UserShare;
import com.spotchzxk.shared.exception.ResetLimitExceededException;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.user.repository.TitleRepository;
import com.spotchzxk.domain.user.repository.UserItemRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PortfolioService {

    // Issue #4: raised initial balance to 10,000,000 (was 1,000,000) to accommodate megaphone and stock-add costs
    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);
    private static final int MAX_DAILY_RESETS = 3;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private final UserRepository userRepository;
    private final RankCacheService rankCacheService;
    private final UserShareRepository userShareRepository;
    private final TitleRepository titleRepository;
    private final UserItemRepository userItemRepository;
    private final OrderRepository orderRepository;
    private final TradeEngine tradeEngine;
    private final TransactionTemplate transactionTemplate;

    @Transactional
    public User getOrCreate(String userId) {
        return userRepository.findById(userId).orElseGet(() -> {
            User p = User.builder().id(userId).coinBalance(INITIAL_BALANCE).build();
            return userRepository.save(p);
        });
    }

    public Map<String, Object> getPortfolioResponse(String userId) {
        User p = getOrCreate(userId);
        List<UserShare> userShares = userShareRepository.findByUserIdWithPositiveQuantityAndStock(userId);
        Map<String, String> shares = userShares.stream()
                .collect(Collectors.toMap(
                        s -> s.getStock().getChannelId(),
                        s -> s.getQuantity().toPlainString()
                ));
        Map<String, String> avgPrices = userShares.stream()
                .collect(Collectors.toMap(
                        s -> s.getStock().getChannelId(),
                        s -> (s.getAvgPrice() != null ? s.getAvgPrice() : BigDecimal.ZERO).toPlainString()
                ));
        Map<String, Object> response = new HashMap<>();
        response.put("balance", p.getCoinBalance().toPlainString());
        response.put("shares", shares);
        response.put("avgPrices", avgPrices);
        response.put("dividendTotal", (p.getDividendTotal() != null ? p.getDividendTotal() : BigDecimal.ZERO).toPlainString());
        response.put("donationTotal", (p.getDonationTotal() != null ? p.getDonationTotal() : BigDecimal.ZERO).toPlainString());
        response.put("displayName", p.getDisplayName());
        response.put("realizedProfit", (p.getRealizedProfit() != null ? p.getRealizedProfit() : BigDecimal.ZERO).toPlainString());
        response.put("rankingNicknamePublic", p.isRankingNicknamePublic());
        response.put("nicknameChangeTickets", p.getNicknameChangeTickets());
        response.put("stockAddTickets", p.getStockAddTickets());
        response.put("items", inventoryItems(p));
        response.put("titles", titleRepository.findByUserIdOrderByGrantedAtDesc(userId).stream()
                .map(this::titleResponse)
                .toList());
        response.put("selectedTitleId", p.getSelectedTitleId());
        if (!p.isGuest()) {
            response.put("leagueRank", rankCacheService.getCachedRank(userId));
            response.put("leagueTotal", rankCacheService.getCachedTotal());
        }
        return response;
    }

    private List<Map<String, Object>> inventoryItems(User user) {
        List<Map<String, Object>> items = new ArrayList<>();
        if (user.getNicknameChangeTickets() > 0) {
            items.add(itemResponse("nickname-change-ticket", "닉네임 변경권", user.getNicknameChangeTickets()));
        }
        if (user.getStockAddTickets() > 0) {
            items.add(itemResponse("stock-add-ticket", "종목 추가 티켓", user.getStockAddTickets()));
        }
        items.addAll(userItemRepository.findByUserIdOrderByUpdatedAtDesc(user.getId()).stream()
                .filter(item -> item.getQuantity() > 0)
                .map(item -> itemResponse(item.getItemType(), item.getItemName(), item.getQuantity()))
                .toList());
        return items;
    }

    private Map<String, Object> itemResponse(String type, String name, long quantity) {
        return Map.of(
                "type", type,
                "name", name,
                "quantity", quantity
        );
    }

    private Map<String, Object> titleResponse(Title title) {
        return Map.of(
                "id", title.getId(),
                "label", titleLabel(title.getTitleType()),
                "description", titleDescription(title),
                "tone", titleTone(title.getTitleType()),
                "awardedAt", title.getGrantedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    private String titleLabel(String type) {
        return switch (type) {
            case "BETA_SEASON" -> "베타 개척자";
            case "BETA_TIER" -> "베타 티어";
            case "BETA_REALIZED_TOP" -> "베타 수익왕";
            case "BETA_DIVIDEND_TOP" -> "베타 배당왕";
            case "BETA_FAN_TOP" -> "베타 대표 팬";
            case "CHEER_1" -> "후원 팬";
            case "CHEER_2" -> "열성 팬";
            case "CHEER_3" -> "대표 팬";
            default -> type;
        };
    }

    private String titleDescription(Title title) {
        if (title.getStockId() != null && title.getTitleType().startsWith("CHEER_")) {
            return "이 스트리머 종목의 팬 랭킹 칭호";
        }
        if ("BETA_TIER".equals(title.getTitleType())) {
            return "베타 시즌 종료 시점의 최종 티어 기준 칭호";
        }
        return "정식 전환 및 시즌 보상 칭호";
    }

    private String titleTone(String type) {
        return switch (type) {
            case "BETA_SEASON", "BETA_TIER", "CHEER_3" -> "gold";
            case "BETA_DIVIDEND_TOP" -> "blue";
            case "BETA_REALIZED_TOP", "CHEER_2" -> "green";
            case "BETA_FAN_TOP", "CHEER_1" -> "red";
            default -> "gray";
        };
    }

    public void resetPortfolio(String userId) {
        tradeEngine.runWithUserLock(userId, () -> transactionTemplate.executeWithoutResult(status ->
                resetPortfolioLocked(userId)));
    }

    private void resetPortfolioLocked(String userId) {
        User p = getOrCreate(userId);

        List<UserShare> shares = userShareRepository.findByUserId(userId);
        boolean hasShares = shares.stream().anyMatch(s -> s.getQuantity().compareTo(BigDecimal.ZERO) > 0);
        if (hasShares) {
            throw new IllegalStateException("보유 주식이 있으면 초기화할 수 없습니다. 먼저 매도 후 시도해주세요.");
        }
        boolean hasPendingOrders = !orderRepository.findByUserIdAndStatusOrderByCreatedAtDesc(userId, "pending").isEmpty();
        if (hasPendingOrders) {
            throw new IllegalStateException("미체결 주문이 있으면 초기화할 수 없습니다. 먼저 모든 주문을 취소해주세요.");
        }

        LocalDate todayKst = LocalDate.now(KST);
        p.applyDailyResetTracking(todayKst);

        if (p.getResetCount() >= MAX_DAILY_RESETS) {
            throw new ResetLimitExceededException();
        }

        p.incrementResetCount();
        p.resetFinancials(INITIAL_BALANCE);
        userRepository.save(p);

        userShareRepository.deleteAll(shares);
        evictAfterCommit(userId);
        // Issue #24: ?꾨즺??二쇰Ц 湲곕줉? ??젣?섏? ?딆쓬 ??嫄곕옒 ?덉뒪?좊━ 蹂댁〈
    }

    private void evictAfterCommit(String userId) {
        Runnable evict = () -> {
            tradeEngine.evictUserCache(userId);
            rankCacheService.evict(userId);
        };
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            evict.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                evict.run();
            }
        });
    }

    public int getRemainingResets(String userId) {
        User p = getOrCreate(userId);
        LocalDate todayKst = LocalDate.now(KST);
        if (!todayKst.equals(p.getLastResetDate())) {
            return MAX_DAILY_RESETS;
        }
        long remaining = MAX_DAILY_RESETS - p.getResetCount();
        return (int) Math.max(0, remaining);
    }
}


