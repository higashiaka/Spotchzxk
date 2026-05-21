package com.spotchzxk.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import java.math.BigDecimal;
import java.util.List;

@Getter
@AllArgsConstructor
public class OrderBookDto {
    private String streamerId;
    private BigDecimal currentPrice;
    private List<OrderBookEntry> asks; // 매도 호가 (가격 오름차순)
    private List<OrderBookEntry> bids; // 매수 호가 (가격 내림차순)

    @Getter
    @AllArgsConstructor
    public static class OrderBookEntry {
        private BigDecimal price;
        private long quantity;
    }
}
