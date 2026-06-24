package com.spotchzxk.application;

import com.spotchzxk.domain.dividend.repository.DividendLogRepository;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserDividendLogRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DividendServiceTest {

    @Test
    void paysDividendWhenPerShareRateRequiresTwelveDecimalPlaces() {
        UserShareRepository userShareRepository = mock(UserShareRepository.class);
        UserDividendLogRepository userDividendLogRepository = mock(UserDividendLogRepository.class);
        DividendLogRepository dividendLogRepository = mock(DividendLogRepository.class);
        StockRepository stockRepository = mock(StockRepository.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        TradeEngine tradeEngine = mock(TradeEngine.class);
        Stock stock = mock(Stock.class);

        when(stock.getChannelId()).thenReturn("guri");
        when(stock.getStreamerName()).thenReturn("구리뱅이");
        when(stock.getProfileImageUrl()).thenReturn("");
        when(stock.getFeePool()).thenReturn(new BigInteger("40000000000000000000000"));
        when(stockRepository.findById("guri")).thenReturn(Optional.of(stock));
        when(userShareRepository.sumPreStreamQuantityByChannel("guri"))
                .thenReturn(new BigDecimal("2300000000000000000000000000000000"));
        when(userShareRepository.distributeDividends(eq("guri"), any(BigDecimal.class))).thenReturn(1);
        when(userShareRepository.findByStockChannelIdWithPositiveQuantity("guri")).thenReturn(java.util.List.of());

        DividendService service = new DividendService(
                userShareRepository,
                userDividendLogRepository,
                dividendLogRepository,
                stockRepository,
                messagingTemplate,
                tradeEngine
        );

        service.payIntervalDividend(stock);

        verify(userShareRepository).distributeDividends(
                "guri",
                new BigDecimal("0.000000000006")
        );
        verify(stock).drainFeePool(new BigInteger("14000000000000000000000"));
        verify(stockRepository).save(stock);
    }
}
