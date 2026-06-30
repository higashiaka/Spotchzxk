package com.spotchzxk.application;

import com.spotchzxk.domain.megaphone.entity.MegaphonePost;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.megaphone.repository.MegaphonePostRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MegaphoneService {

    private static final int DAILY_LIMIT = 5;
    private static final int MAX_MESSAGE_LENGTH = 50;
    private static final BigDecimal MEGAPHONE_PRICE = new BigDecimal("30000000");
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final String CHZZK_LIVE_BASE_URL = "https://chzzk.naver.com/live/";

    private final MegaphonePostRepository megaphonePostRepository;
    private final UserRepository userRepository;
    private final StockRepository stockRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final TradeEngine tradeEngine;
    private final TransactionTemplate transactionTemplate;

    public MegaphonePost useMegaphone(String uid, String channelId, String message) {
        MegaphonePost[] result = new MegaphonePost[1];
        tradeEngine.runWithUserLock(uid, () -> result[0] = transactionTemplate.execute(status ->
                useMegaphoneLocked(uid, channelId, message)));
        return result[0];
    }

    private MegaphonePost useMegaphoneLocked(String uid, String channelId, String message) {
        User user = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));

        if (user.getCoinBalance().compareTo(MEGAPHONE_PRICE) < 0) {
            throw new IllegalStateException("잔고가 부족합니다. 확성기 사용에는 3천만원이 필요합니다.");
        }

        LocalDateTime startOfDay = startOfTodayKst();
        LocalDateTime endOfDay = startOfDay.plusDays(1);
        long usesToday = megaphonePostRepository.countByUserIdAndCreatedAtBetween(uid, startOfDay, endOfDay);
        if (usesToday >= DAILY_LIMIT) {
            throw new IllegalStateException("오늘 확성기 사용 횟수를 모두 사용했습니다. (1일 최대 5회)");
        }

        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 채널입니다."));
        if (!stock.isLive()) {
            throw new IllegalStateException("현재 라이브 중인 스트리머에게만 확성기를 사용할 수 있습니다.");
        }

        String normalizedMessage = normalizeMessage(message);
        if (normalizedMessage == null) {
            throw new IllegalStateException("확성기 메시지를 입력해주세요.");
        }

        if (userRepository.addToBalance(uid, MEGAPHONE_PRICE.negate()) != 1) {
            throw new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
        }
        tradeEngine.evictUserCache(uid);

        MegaphonePost post = MegaphonePost.builder()
                .id(UUID.randomUUID().toString())
                .userId(uid)
                .channelId(channelId)
                .streamerName(stock.getStreamerName())
                .message(normalizedMessage)
                .liveUrl(CHZZK_LIVE_BASE_URL + channelId)
                .liveSessionStartedAt(stock.getLiveStartedAt())
                .createdAt(nowKst())
                .build();

        MegaphonePost savedPost = megaphonePostRepository.save(post);
        sendAfterCommit(savedPost);

        return savedPost;
    }

    private void sendAfterCommit(MegaphonePost post) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            messagingTemplate.convertAndSend("/topic/megaphone", post);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                messagingTemplate.convertAndSend("/topic/megaphone", post);
            }
        });
    }

    @Transactional(readOnly = true)
    public List<MegaphonePost> getRecentPosts() {
        return megaphonePostRepository.findRecentPostsForLiveStocks();
    }

    @Transactional(readOnly = true)
    public long getMyUsesToday(String uid) {
        LocalDateTime startOfDay = startOfTodayKst();
        LocalDateTime endOfDay = startOfDay.plusDays(1);
        return megaphonePostRepository.countByUserIdAndCreatedAtBetween(uid, startOfDay, endOfDay);
    }

    private LocalDateTime startOfTodayKst() {
        return LocalDate.now(KST).atStartOfDay();
    }

    private LocalDateTime nowKst() {
        return LocalDateTime.now(KST);
    }

    private String normalizeMessage(String message) {
        if (message == null) {
            return null;
        }
        String trimmed = message.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > MAX_MESSAGE_LENGTH) {
            throw new IllegalStateException("확성기 메시지는 최대 50자까지 입력할 수 있습니다.");
        }
        return trimmed;
    }

}


