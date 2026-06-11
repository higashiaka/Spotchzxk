package com.spotchzxk.application;

import com.spotchzxk.domain.megaphone.entity.MegaphonePost;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.megaphone.repository.MegaphonePostRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
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
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MegaphoneService {

    private static final int DAILY_LIMIT = 3;
    private static final int MAX_MESSAGE_LENGTH = 50;
    private static final BigDecimal MEGAPHONE_PRICE = new BigDecimal("30000000");
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

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
                .orElseThrow(() -> new IllegalStateException("?ъ슜?먮? 李얠쓣 ???놁뒿?덈떎."));

        if (user.getCoinBalance().compareTo(MEGAPHONE_PRICE) < 0) {
            throw new IllegalStateException("?붿븸??遺議깊빀?덈떎. ?뺤꽦湲??ъ슜?먮뒗 3泥쒕쭔?먯씠 ?꾩슂?⑸땲??");
        }

        LocalDateTime startOfDay = LocalDate.now(KST).atStartOfDay();
        LocalDateTime endOfDay = startOfDay.plusDays(1);
        long usesToday = megaphonePostRepository.countByUserIdAndCreatedAtBetween(uid, startOfDay, endOfDay);
        if (usesToday >= DAILY_LIMIT) {
            throw new IllegalStateException("?ㅻ뒛 ?뺤꽦湲??ъ슜 ?잛닔瑜?紐⑤몢 ?ъ슜?덉뒿?덈떎. (1??理쒕? 3??");
        }

        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("議댁옱?섏? ?딅뒗 醫낅ぉ?낅땲??"));
        if (!stock.isLive()) {
            throw new IllegalStateException("?꾩옱 ?쇱씠釉?以묒씤 ?ㅽ듃由щ㉧留??뺤꽦湲곕? ?ъ슜?????덉뒿?덈떎.");
        }

        String normalizedMessage = normalizeMessage(message);
        if (normalizedMessage == null) {
            throw new IllegalStateException("?뺤꽦湲?硫붿떆吏瑜??낅젰?댁＜?몄슂.");
        }

        if (userRepository.addToBalance(uid, MEGAPHONE_PRICE.negate()) != 1) {
            throw new IllegalStateException("?ъ슜???뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??");
        }
        tradeEngine.evictUserCache(uid);

        MegaphonePost post = MegaphonePost.builder()
                .id(UUID.randomUUID().toString())
                .userId(uid)
                .channelId(channelId)
                .streamerName(stock.getStreamerName())
                .message(normalizedMessage)
                .liveUrl("https://chzzk.naver.com/live/" + channelId)
                .liveSessionStartedAt(stock.getLiveStartedAt())
                .createdAt(LocalDateTime.now(KST))
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
        List<Stock> liveStocks = stockRepository.findByIsLiveTrue();
        if (liveStocks.isEmpty()) {
            return List.of();
        }

        List<String> liveChannelIds = liveStocks.stream()
                .map(Stock::getChannelId)
                .toList();
        List<MegaphonePost> recentPosts = megaphonePostRepository
                .findByChannelIdInOrderByCreatedAtDesc(liveChannelIds, PageRequest.of(0, 200));

        return recentPosts.stream()
                .filter(post -> isVisibleInCurrentLiveSession(post, liveStocks))
                .sorted(Comparator.comparing(MegaphonePost::getCreatedAt).reversed())
                .limit(20)
                .toList();
    }

    @Transactional(readOnly = true)
    public long getMyUsesToday(String uid) {
        LocalDateTime startOfDay = LocalDate.now(KST).atStartOfDay();
        LocalDateTime endOfDay = startOfDay.plusDays(1);
        return megaphonePostRepository.countByUserIdAndCreatedAtBetween(uid, startOfDay, endOfDay);
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
            throw new IllegalStateException("?뺤꽦湲?硫붿떆吏??理쒕? 50?먭퉴吏 ?낅젰?????덉뒿?덈떎.");
        }
        return trimmed;
    }

    private boolean isVisibleInCurrentLiveSession(MegaphonePost post, List<Stock> liveStocks) {
        return liveStocks.stream()
                .filter(stock -> stock.getChannelId().equals(post.getChannelId()))
                .findFirst()
                .map(stock -> Objects.equals(stock.getLiveStartedAt(), post.getLiveSessionStartedAt()))
                .orElse(false);
    }
}


