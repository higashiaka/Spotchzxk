package com.spotchzxk.application;

import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import com.spotchzxk.infrastructure.chzzk.ChzzkApiClient;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChzzkLivePollingServiceTest {

    private final StockRepository stockRepository = mock(StockRepository.class);
    private final DividendService dividendService = mock(DividendService.class);
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
    private final UserShareRepository userShareRepository = mock(UserShareRepository.class);
    private final ChzzkApiClient chzzkApiClient = mock(ChzzkApiClient.class);
    private final TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
    private final StockSplitService stockSplitService = mock(StockSplitService.class);

    private final ChzzkLivePollingService service = new ChzzkLivePollingService(
            stockRepository,
            dividendService,
            messagingTemplate,
            userShareRepository,
            chzzkApiClient,
            transactionTemplate,
            stockSplitService
    );

    @Test
    void pollLiveStatusSkipsEventStocks() {
        when(stockRepository.findAll()).thenReturn(List.of(
                stock("event-test-stock", false, null),
                stock("real-channel-id", false, null)
        ));

        service.pollLiveStatus();

        verify(chzzkApiClient, never()).fetchChannelStatus("event-test-stock");
        verify(chzzkApiClient).fetchChannelStatus("real-channel-id");
    }

    @Test
    void payDueIntervalDividendsDoesNotReverifyLiveStatus() {
        LocalDateTime liveStartedAt = LocalDateTime.now().minusMinutes(61);
        when(stockRepository.findByIsLiveTrue()).thenReturn(List.of(
                stock("event-live-stock", true, liveStartedAt),
                stock("real-live-channel", true, liveStartedAt)
        ));

        service.initLiveStockCache();
        service.payDueIntervalDividends();

        verify(chzzkApiClient, never()).fetchChannelStatus("event-live-stock");
        verify(chzzkApiClient, never()).fetchChannelStatus("real-live-channel");
    }

    private Stock stock(String channelId, boolean isLive, LocalDateTime liveStartedAt) {
        return Stock.builder()
                .channelId(channelId)
                .streamerName(channelId)
                .basePrice(BigDecimal.valueOf(10_000))
                .listingPrice(BigDecimal.valueOf(10_000))
                .currentPrice(BigDecimal.valueOf(10_000))
                .totalSupply(BigDecimal.valueOf(100_000))
                .dailyVolume(BigDecimal.ZERO)
                .isLive(isLive)
                .liveStartedAt(liveStartedAt)
                .build();
    }
}

