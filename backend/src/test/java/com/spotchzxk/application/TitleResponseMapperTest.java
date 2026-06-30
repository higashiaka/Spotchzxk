package com.spotchzxk.application;

import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.entity.Title;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TitleResponseMapperTest {

    private final StockRepository stockRepository = mock(StockRepository.class);
    private final TitleResponseMapper mapper = new TitleResponseMapper(stockRepository);

    @Test
    void usesSnapshotNameForCheerVvipWithoutStockLookup() {
        Title title = title("stock-1", "스냅샷 스트리머", "CHEER_VVIP");

        Map<String, Object> response = mapper.toResponse(title);

        assertThat(response.get("label")).isEqualTo("스냅샷 스트리머의 VVIP");
        verify(stockRepository, never()).findById("stock-1");
    }

    @Test
    void fallsBackToCurrentStockNameWhenSnapshotIsMissing() {
        Stock stock = Stock.builder()
                .channelId("stock-1")
                .streamerName("현재 스트리머")
                .build();
        when(stockRepository.findById("stock-1")).thenReturn(Optional.of(stock));
        Title title = title("stock-1", null, "CHEER_VIP");

        Map<String, Object> response = mapper.toResponse(title);

        assertThat(response.get("label")).isEqualTo("현재 스트리머의 VIP");
    }

    @Test
    void usesUnknownStreamerFallbackWhenSnapshotAndStockAreMissing() {
        when(stockRepository.findById("stock-1")).thenReturn(Optional.empty());
        Title title = title("stock-1", null, "CHEER_VVIP");

        Map<String, Object> response = mapper.toResponse(title);

        assertThat(response.get("label")).isEqualTo("알 수 없는 스트리머의 VVIP");
    }

    private static Title title(String stockId, String stockNameSnapshot, String titleType) {
        return Title.builder()
                .id(1L)
                .userId("user-1")
                .stockId(stockId)
                .stockNameSnapshot(stockNameSnapshot)
                .titleType(titleType)
                .grantedAt(LocalDateTime.of(2026, 6, 29, 18, 0))
                .build();
    }
}
