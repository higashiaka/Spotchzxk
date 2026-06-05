package com.spotchzxk.service;

import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class TradeEnginePricingTest {

    private final TradeEngine tradeEngine = new TradeEngine(
            mock(UserRepository.class),
            mock(UserShareRepository.class),
            mock(StockRepository.class),
            mock(OrderRepository.class),
            mock(SimpMessagingTemplate.class),
            mock(PlatformTransactionManager.class),
            mock(CandleService.class)
    );

    @Test
    void marketOrderSettlesAtAverageImpactPriceAndStoresFinalPrice() {
        TradeEngine.TradePrices prices = tradeEngine.calculateTradePrices(BigDecimal.valueOf(10_000), true, 700);

        assertThat(prices.executionPrice()).isGreaterThan(BigDecimal.valueOf(10_000));
        assertThat(prices.executionPrice()).isLessThan(prices.finalPrice());
        assertThat(prices.finalPrice()).isEqualByComparingTo(BigDecimal.valueOf(14_189));
    }

    @Test
    void pumpThenDumpIsNotProfitableWithAverageImpactSettlement() {
        TradeEngine.TradePrices firstBuy = tradeEngine.calculateTradePrices(BigDecimal.valueOf(10_000), true, 700);
        TradeEngine.TradePrices secondBuy = tradeEngine.calculateTradePrices(firstBuy.finalPrice(), true, 300);
        TradeEngine.TradePrices sell = tradeEngine.calculateTradePrices(secondBuy.finalPrice(), false, 1_000);

        BigDecimal buyCost = firstBuy.executionPrice().multiply(BigDecimal.valueOf(700))
                .add(secondBuy.executionPrice().multiply(BigDecimal.valueOf(300)));
        BigDecimal sellProceeds = sell.executionPrice().multiply(BigDecimal.valueOf(1_000));

        assertThat(sellProceeds).isLessThan(buyCost);
    }

    @Test
    void splitBuyThenSingleSellReturnsPriceToStartingLevel() {
        TradeEngine.TradePrices firstBuy = tradeEngine.calculateTradePrices(BigDecimal.valueOf(10_000), true, 700);
        TradeEngine.TradePrices secondBuy = tradeEngine.calculateTradePrices(firstBuy.finalPrice(), true, 300);
        TradeEngine.TradePrices sell = tradeEngine.calculateTradePrices(secondBuy.finalPrice(), false, 1_000);

        assertThat(sell.finalPrice()).isEqualByComparingTo(BigDecimal.valueOf(10_000));
    }
}
