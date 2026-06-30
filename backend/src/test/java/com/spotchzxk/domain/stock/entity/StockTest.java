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
        assertThat(stock.getTotalSupply()).isEqualByComparingTo("10000");
        assertThat(stock.getDailyVolume()).isEqualByComparingTo("12");
        assertThat(stock.getIssuedShares()).isEqualByComparingTo("45");
        assertThat(stock.getPreStreamFloat()).isEqualByComparingTo("78");
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
    void applyReverseStockSplitKeepsShareReserveAtLeastOne() {
        Stock stock = Stock.builder()
                .channelId("stock-1")
                .streamerName("streamer")
                .currentPrice(BigDecimal.valueOf(100))
                .basePrice(BigDecimal.valueOf(100))
                .listingPrice(BigDecimal.valueOf(100))
                .coinReserve(BigInteger.valueOf(1000))
                .shareReserve(BigInteger.ZERO)
                .build();

        stock.applyReverseStockSplit(10);

        assertThat(stock.getShareReserve()).isEqualTo(BigInteger.ONE);
        assertThat(stock.getCurrentPrice()).isEqualByComparingTo("1000.000000");
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
