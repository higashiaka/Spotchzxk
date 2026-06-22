package com.spotchzxk.presentation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import java.util.List;

@Getter
@AllArgsConstructor
public class OrderBookDto {
    private String streamerId;
    private String currentPrice;
    private List<OrderBookEntry> asks; // Ask quotes (ascending price order)
    private List<OrderBookEntry> bids; // Bid quotes (descending price order)

    @Getter
    @AllArgsConstructor
    public static class OrderBookEntry {
        private String price;
        private String quantity;
    }
}

