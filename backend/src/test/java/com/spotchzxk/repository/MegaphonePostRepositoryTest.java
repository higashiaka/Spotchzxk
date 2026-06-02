package com.spotchzxk.repository;

import com.spotchzxk.entity.MegaphonePost;
import com.spotchzxk.entity.Stock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class MegaphonePostRepositoryTest {

    @Autowired
    private MegaphonePostRepository megaphonePostRepository;

    @Autowired
    private StockRepository stockRepository;

    @Test
    void findVisiblePostsKeepsPostFromCurrentLiveSessionAfterRefresh() {
        LocalDateTime liveStartedAt = LocalDateTime.of(2026, 6, 2, 20, 0);
        stockRepository.save(stock("channel-1", true, liveStartedAt));
        megaphonePostRepository.save(post("post-1", "channel-1", liveStartedAt, liveStartedAt.plusMinutes(5)));

        List<MegaphonePost> posts = megaphonePostRepository.findVisiblePosts(PageRequest.of(0, 20));

        assertThat(posts).extracting(MegaphonePost::getId).containsExactly("post-1");
    }

    @Test
    void findVisiblePostsHidesPostWhenStreamEnds() {
        LocalDateTime liveStartedAt = LocalDateTime.of(2026, 6, 2, 20, 0);
        stockRepository.save(stock("channel-1", false, liveStartedAt));
        megaphonePostRepository.save(post("post-1", "channel-1", liveStartedAt, liveStartedAt.plusMinutes(5)));

        List<MegaphonePost> posts = megaphonePostRepository.findVisiblePosts(PageRequest.of(0, 20));

        assertThat(posts).isEmpty();
    }

    @Test
    void findVisiblePostsHidesPostFromPreviousLiveSession() {
        LocalDateTime currentLiveStartedAt = LocalDateTime.of(2026, 6, 2, 20, 0);
        stockRepository.save(stock("channel-1", true, currentLiveStartedAt));
        megaphonePostRepository.save(post("old-post", "channel-1", currentLiveStartedAt.minusHours(2), currentLiveStartedAt.minusHours(2).plusMinutes(5)));
        megaphonePostRepository.save(post("current-post", "channel-1", currentLiveStartedAt, currentLiveStartedAt.plusMinutes(5)));

        List<MegaphonePost> posts = megaphonePostRepository.findVisiblePosts(PageRequest.of(0, 20));

        assertThat(posts).extracting(MegaphonePost::getId).containsExactly("current-post");
    }

    private Stock stock(String channelId, boolean isLive, LocalDateTime liveStartedAt) {
        return Stock.builder()
                .channelId(channelId)
                .streamerName("테스트")
                .totalSupply(1_000)
                .basePrice(1_000)
                .currentPrice(1_000)
                .listedAt(LocalDateTime.of(2026, 6, 1, 0, 0))
                .isLive(isLive)
                .liveStartedAt(liveStartedAt)
                .build();
    }

    @Test
    void findVisiblePostsKeepsPostWhenLiveStartedAtIsUnknownForBothPostAndStock() {
        stockRepository.save(stock("channel-1", true, null));
        megaphonePostRepository.save(post("post-1", "channel-1", null, LocalDateTime.of(2026, 6, 2, 20, 5)));

        List<MegaphonePost> posts = megaphonePostRepository.findVisiblePosts(PageRequest.of(0, 20));

        assertThat(posts).extracting(MegaphonePost::getId).containsExactly("post-1");
    }

    private MegaphonePost post(String id, String channelId, LocalDateTime liveSessionStartedAt, LocalDateTime createdAt) {
        return MegaphonePost.builder()
                .id(id)
                .userId("user-1")
                .channelId(channelId)
                .streamerName("테스트")
                .message("hello")
                .liveUrl("https://chzzk.naver.com/live/" + channelId)
                .liveSessionStartedAt(liveSessionStartedAt)
                .createdAt(createdAt)
                .build();
    }
}
