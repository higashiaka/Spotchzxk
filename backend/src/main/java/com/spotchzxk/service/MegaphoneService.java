package com.spotchzxk.service;

import com.spotchzxk.entity.MegaphonePost;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.User;
import com.spotchzxk.repository.MegaphonePostRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
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

    @Transactional
    public MegaphonePost useMegaphone(String uid, String channelId, String message) {
        User user = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));

        if (user.getCoinBalance().compareTo(MEGAPHONE_PRICE) < 0) {
            throw new IllegalStateException("잔액이 부족합니다. 확성기 사용에는 3천만 코인이 필요합니다.");
        }

        LocalDateTime startOfDay = LocalDate.now(KST).atStartOfDay();
        LocalDateTime endOfDay = startOfDay.plusDays(1);
        long usesToday = megaphonePostRepository.countByUserIdAndCreatedAtBetween(uid, startOfDay, endOfDay);
        if (usesToday >= DAILY_LIMIT) {
            throw new IllegalStateException("오늘 확성기 사용 횟수를 모두 사용했습니다. (1일 최대 3회)");
        }

        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 종목입니다."));
        if (!stock.isLive()) {
            throw new IllegalStateException("현재 라이브 중인 스트리머만 확성기를 사용할 수 있습니다.");
        }

        String normalizedMessage = normalizeMessage(message);

        user.deductBalance(MEGAPHONE_PRICE);
        userRepository.save(user);

        MegaphonePost post = MegaphonePost.builder()
                .id(UUID.randomUUID().toString())
                .userId(uid)
                .channelId(channelId)
                .streamerName(stock.getStreamerName())
                .message(normalizedMessage)
                .liveUrl("https://chzzk.naver.com/live/" + channelId)
                .createdAt(LocalDateTime.now(KST))
                .build();

        megaphonePostRepository.save(post);
        messagingTemplate.convertAndSend("/topic/megaphone", post);

        return post;
    }

    @Transactional(readOnly = true)
    public List<MegaphonePost> getRecentPosts() {
        return megaphonePostRepository.findVisiblePosts(PageRequest.of(0, 20));
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
            throw new IllegalStateException("확성기 메시지는 최대 50자까지 입력할 수 있습니다.");
        }
        return trimmed;
    }
}
