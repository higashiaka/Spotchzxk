package com.spotchzxk.application;

import com.spotchzxk.domain.megaphone.entity.MegaphonePost;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.megaphone.repository.MegaphonePostRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MegaphoneServiceTest {

    private final MegaphonePostRepository megaphonePostRepository = mock(MegaphonePostRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final StockRepository stockRepository = mock(StockRepository.class);
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
    private final TradeEngine tradeEngine = mock(TradeEngine.class);
    private final TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);

    private final MegaphoneService service;

    MegaphoneServiceTest() {
        doAnswer(invocation -> {
            invocation.<Runnable>getArgument(1).run();
            return null;
        }).when(tradeEngine).runWithUserLock(any(), any(Runnable.class));
        when(megaphonePostRepository.save(any(MegaphonePost.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(null);
        });
        service = new MegaphoneService(
                megaphonePostRepository,
                userRepository,
                stockRepository,
                messagingTemplate,
                tradeEngine,
                transactionTemplate
        );
    }

    @Test
    void useMegaphoneTrimsMessageDeductsBalanceAndBroadcastsPost() {
        User user = user("user-1", "40000000");
        Stock stock = liveStock("channel-1");
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(stockRepository.findById("channel-1")).thenReturn(Optional.of(stock));
        when(userRepository.addToBalance(eq("user-1"), any(BigDecimal.class))).thenReturn(1);

        MegaphonePost post = service.useMegaphone("user-1", "channel-1", "  지금 라이브 보세요  ");

        verify(userRepository).addToBalance("user-1", new BigDecimal("-30000000"));
        verify(tradeEngine).evictUserCache("user-1");
        assertThat(post.getMessage()).isEqualTo("지금 라이브 보세요");
        assertThat(post.getLiveUrl()).isEqualTo("https://chzzk.naver.com/live/channel-1");
        assertThat(post.getLiveSessionStartedAt()).isEqualTo(stock.getLiveStartedAt());

        ArgumentCaptor<MegaphonePost> savedPost = ArgumentCaptor.forClass(MegaphonePost.class);
        verify(megaphonePostRepository).save(savedPost.capture());
        verify(messagingTemplate).convertAndSend("/topic/megaphone", savedPost.getValue());
    }

    @Test
    void useMegaphoneRejectsBlankMessageBeforeCharging() {
        User user = user("user-1", "40000000");
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(stockRepository.findById("channel-1")).thenReturn(Optional.of(liveStock("channel-1")));

        assertThatThrownBy(() -> service.useMegaphone("user-1", "channel-1", "   "))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("확성기 메시지를 입력해주세요.");

        verify(userRepository, never()).addToBalance(eq("user-1"), any(BigDecimal.class));
        verify(megaphonePostRepository, never()).save(any());
        verify(messagingTemplate, never()).convertAndSend(eq("/topic/megaphone"), any(MegaphonePost.class));
    }

    @Test
    void useMegaphoneRejectsMessageLongerThanClientLimitBeforeCharging() {
        User user = user("user-1", "40000000");
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(stockRepository.findById("channel-1")).thenReturn(Optional.of(liveStock("channel-1")));

        assertThatThrownBy(() -> service.useMegaphone("user-1", "channel-1", "媛".repeat(51)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("확성기 메시지는 최대 50자까지 입력할 수 있습니다.");

        assertThat(user.getCoinBalance()).isEqualByComparingTo("40000000");
        verify(userRepository, never()).save(any());
        verify(megaphonePostRepository, never()).save(any());
        verify(messagingTemplate, never()).convertAndSend(eq("/topic/megaphone"), any(MegaphonePost.class));
    }

    @Test
    void useMegaphoneRejectsOfflineStockBeforeCharging() {
        User user = user("user-1", "40000000");
        Stock stock = Stock.builder()
                .channelId("channel-1")
                .streamerName("streamer")
                .isLive(false)
                .build();
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(stockRepository.findById("channel-1")).thenReturn(Optional.of(stock));

        assertThatThrownBy(() -> service.useMegaphone("user-1", "channel-1", "hello"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("현재 라이브 중인 스트리머에게만 확성기를 사용할 수 있습니다.");

        assertThat(user.getCoinBalance()).isEqualByComparingTo("40000000");
        verify(userRepository, never()).save(any());
        verify(megaphonePostRepository, never()).save(any());
    }

    @Test
    void getRecentPostsReturnsOnlyPostsFromCurrentLiveSessionWithoutJoiningTables() {
        LocalDateTime currentLiveStartedAt = LocalDateTime.of(2026, 6, 2, 20, 0);
        Stock liveStock = Stock.builder()
                .channelId("channel-1")
                .streamerName("streamer")
                .isLive(true)
                .liveStartedAt(currentLiveStartedAt)
                .build();
        MegaphonePost currentPost = post("current-post", "channel-1", currentLiveStartedAt, currentLiveStartedAt.plusMinutes(5));
        MegaphonePost oldPost = post("old-post", "channel-1", currentLiveStartedAt.minusHours(2), currentLiveStartedAt.minusHours(1));
        when(stockRepository.findByIsLiveTrue()).thenReturn(List.of(liveStock));
        when(megaphonePostRepository.findByChannelIdInOrderByCreatedAtDesc(
                eq(List.of("channel-1")),
                eq(PageRequest.of(0, 200))
        )).thenReturn(List.of(currentPost, oldPost));

        List<MegaphonePost> posts = service.getRecentPosts();

        assertThat(posts).containsExactly(currentPost);
    }

    private User user(String id, String coinBalance) {
        return User.builder()
                .id(id)
                .coinBalance(new BigDecimal(coinBalance))
                .build();
    }

    private Stock liveStock(String channelId) {
        LocalDateTime liveStartedAt = LocalDateTime.now().minusMinutes(5);
        return Stock.builder()
                .channelId(channelId)
                .streamerName("streamer")
                .isLive(true)
                .liveStartedAt(liveStartedAt)
                .build();
    }

    private MegaphonePost post(String id, String channelId, LocalDateTime liveSessionStartedAt, LocalDateTime createdAt) {
        return MegaphonePost.builder()
                .id(id)
                .userId("user-1")
                .channelId(channelId)
                .streamerName("streamer")
                .message("hello")
                .liveUrl("https://chzzk.naver.com/live/" + channelId)
                .liveSessionStartedAt(liveSessionStartedAt)
                .createdAt(createdAt)
                .build();
    }
}



