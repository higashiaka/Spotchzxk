package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.StockService;
import com.spotchzxk.presentation.dto.StockResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SitemapControllerTest {

    @Test
    void reusesGeneratedSitemapForRepeatedRequests() {
        StockService stockService = mock(StockService.class);
        when(stockService.getAllStocks()).thenReturn(List.of(
                stock("channel-1"),
                stock("bad\"><script>alert(1)</script>&id")
        ));
        SitemapController controller = new SitemapController(stockService);

        ResponseEntity<String> first = controller.sitemap();
        ResponseEntity<String> second = controller.sitemap();

        assertThat(first.getBody()).contains("https://spotchzxk.xyz/stocks/channel-1");
        assertThat(first.getBody()).contains("bad&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;id");
        assertThat(first.getBody()).doesNotContain("bad\"><script>alert(1)</script>&id");
        assertThat(second.getBody()).isEqualTo(first.getBody());
        assertThat(first.getHeaders().getCacheControl()).isEqualTo("max-age=3600, public");
        verify(stockService, times(1)).getAllStocks();
    }

    private StockResponse stock(String channelId) {
        return new StockResponse(
                channelId, "streamer", null, 0,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                false, null, 0,
                BigDecimal.ZERO,
                0, false, null, null,
                BigDecimal.ZERO
        );
    }
}
