package com.spotchzxk.service;

import com.spotchzxk.entity.MegaphonePost;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.User;
import com.spotchzxk.repository.MegaphonePostRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MegaphoneServiceTest {

    private final MegaphonePostRepository megaphonePostRepository = mock(MegaphonePostRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final StockRepository stockRepository = mock(StockRepository.class);
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);

    private final MegaphoneService service = new MegaphoneService(
            megaphonePostRepository,
            userRepository,
            stockRepository,
            messagingTemplate
    );

    @Test
    void useMegaphoneTrimsMessageDeductsBalanceAndBroadcastsPost() {
        User user = user("user-1", "40000000");
        Stock stock = liveStock("channel-1");
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(stockRepository.findById("channel-1")).thenReturn(Optional.of(stock));

        MegaphonePost post = service.useMegaphone("user-1", "channel-1", "  지금 라이브 재밌어요  ");

        assertThat(user.getCoinBalance()).isEqualByComparingTo("10000000");
        assertThat(post.getMessage()).isEqualTo("지금 라이브 재밌어요");
        assertThat(post.getLiveUrl()).isEqualTo("https://chzzk.naver.com/live/channel-1");

        ArgumentCaptor<MegaphonePost> savedPost = ArgumentCaptor.forClass(MegaphonePost.class);
        verify(megaphonePostRepository).save(savedPost.capture());
        verify(messagingTemplate).convertAndSend("/topic/megaphone", savedPost.getValue());
    }

    @Test
    void useMegaphoneStoresBlankMessageAsNull() {
        User user = user("user-1", "40000000");
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(stockRepository.findById("channel-1")).thenReturn(Optional.of(liveStock("channel-1")));

        MegaphonePost post = service.useMegaphone("user-1", "channel-1", "   ");

        assertThat(post.getMessage()).isNull();
    }

    @Test
    void useMegaphoneRejectsMessageLongerThanClientLimitBeforeCharging() {
        User user = user("user-1", "40000000");
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(stockRepository.findById("channel-1")).thenReturn(Optional.of(liveStock("channel-1")));

        assertThatThrownBy(() -> service.useMegaphone("user-1", "channel-1", "가".repeat(51)))
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
                .streamerName("테스트")
                .isLive(false)
                .build();
        when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
        when(stockRepository.findById("channel-1")).thenReturn(Optional.of(stock));

        assertThatThrownBy(() -> service.useMegaphone("user-1", "channel-1", "hello"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("현재 라이브 중인 스트리머만 확성기를 사용할 수 있습니다.");

        assertThat(user.getCoinBalance()).isEqualByComparingTo("40000000");
        verify(userRepository, never()).save(any());
        verify(megaphonePostRepository, never()).save(any());
    }

    private User user(String id, String coinBalance) {
        return User.builder()
                .id(id)
                .coinBalance(new BigDecimal(coinBalance))
                .build();
    }

    private Stock liveStock(String channelId) {
        return Stock.builder()
                .channelId(channelId)
                .streamerName("테스트")
                .isLive(true)
                .liveStartedAt(LocalDateTime.now().minusMinutes(5))
                .build();
    }
}
