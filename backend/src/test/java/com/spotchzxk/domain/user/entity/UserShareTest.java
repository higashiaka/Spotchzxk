package com.spotchzxk.domain.user.entity;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class UserShareTest {

    @Test
    void liveBuyIncreasesDividendEligibleQuantity() {
        UserShare share = UserShare.builder()
                .quantity(BigDecimal.TEN)
                .preStreamQuantity(BigDecimal.valueOf(3))
                .avgPrice(BigDecimal.valueOf(100))
                .build();

        share.updateOnLiveBuy(BigDecimal.valueOf(15), BigDecimal.valueOf(120), BigDecimal.valueOf(5));

        assertThat(share.getQuantity()).isEqualByComparingTo("15");
        assertThat(share.getAvgPrice()).isEqualByComparingTo("120");
        assertThat(share.getPreStreamQuantity()).isEqualByComparingTo("8");
    }

    @Test
    void liveBuyInitializesNullDividendEligibleQuantity() {
        UserShare share = UserShare.builder()
                .quantity(BigDecimal.ZERO)
                .preStreamQuantity(null)
                .avgPrice(BigDecimal.ZERO)
                .build();

        share.updateOnLiveBuy(BigDecimal.valueOf(7), BigDecimal.valueOf(100), BigDecimal.valueOf(7));

        assertThat(share.getPreStreamQuantity()).isEqualByComparingTo("7");
    }

    @Test
    void sellCapsDividendEligibleQuantityToCurrentHolding() {
        UserShare share = UserShare.builder()
                .quantity(BigDecimal.TEN)
                .preStreamQuantity(BigDecimal.TEN)
                .avgPrice(BigDecimal.valueOf(100))
                .build();

        share.updateOnSell(BigDecimal.valueOf(4));

        assertThat(share.getQuantity()).isEqualByComparingTo("4");
        assertThat(share.getPreStreamQuantity()).isEqualByComparingTo("4");
    }
}
