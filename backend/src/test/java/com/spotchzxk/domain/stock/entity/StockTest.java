package com.spotchzxk.domain.stock.entity;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.math.BigInteger;

import static org.assertj.core.api.Assertions.assertThat;

class StockTest {

    @Test
    void applyReverseStockSplitScalesPriceShareFieldsAndAmmReserve() {
        Stock stock = Stock.builder()
                .channelId("stock-1")
                .streamerName("테스트")
                .currentPrice(BigDecimal.valueOf(50))
                .basePrice(BigDecimal.valueOf(60))
                .listingPrice(BigDecimal.valueOf(1_000))
                .totalSupply(BigDecimal.valueOf(100_000))
                .dailyVolume(BigDecimal.valueOf(123))
                .issuedShares(BigDecimal.valueOf(456))
                .preStreamFloat(BigDecimal.valueOf(789))
                .coinReserve(BigInteger.valueOf(50_000))
                .shareReserve(BigInteger.valueOf(1_000))
                .build();

        stock.applyReverseStockSplit(10);

        assertThat(stock.getCurrentPrice()).isEqualByComparingTo("500");
        assertThat(stock.getBasePrice()).isEqualByComparingTo("600");
        assertThat(stock.getListingPrice()).isEqualByComparingTo("10000");
        assertThat(stock.getTotalSupply()).isEqualByComparingTo("10000.00");
        assertThat(stock.getDailyVolume()).isEqualByComparingTo("12.30");
        assertThat(stock.getIssuedShares()).isEqualByComparingTo("45.60");
        assertThat(stock.getPreStreamFloat()).isEqualByComparingTo("78.90");
        assertThat(stock.getShareReserve()).isEqualTo(BigInteger.valueOf(100));
    }

    @Test
    void applyReverseStockSplitRecomputesZeroCurrentPriceFromAmmPool() {
        Stock stock = Stock.builder()
                .channelId("stock-1")
                .streamerName("streamer")
                .currentPrice(BigDecimal.ZERO)
                .basePrice(BigDecimal.ZERO)
                .listingPrice(BigDecimal.valueOf(1_000))
                .totalSupply(BigDecimal.valueOf(100_000))
                .coinReserve(BigInteger.valueOf(100))
                .shareReserve(BigInteger.valueOf(1_000_000_000))
                .build();

        stock.applyReverseStockSplit(100_000_000);

        assertThat(stock.getShareReserve()).isEqualTo(BigInteger.TEN);
        assertThat(stock.getCurrentPrice()).isEqualByComparingTo("10.000000");
    }

    @Test
    void tradingSuspensionReasonIsStoredAndClearedOnResume() {
        Stock stock = Stock.builder()
                .channelId("stock-1")
                .streamerName("streamer")
                .build();

        stock.suspendTrading("PRICE_BELOW_ONE");

        assertThat(stock.isTradingSuspended()).isTrue();
        assertThat(stock.getTradingSuspensionReason()).isEqualTo("PRICE_BELOW_ONE");

        stock.resumeTrading();

        assertThat(stock.isTradingSuspended()).isFalse();
        assertThat(stock.getTradingSuspensionReason()).isNull();
    }
}
