package com.spotchzxk.presentation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.math.BigDecimal;

@Getter
@AllArgsConstructor
public class TradeResponse {
    private String status;        // "executed" | "pending"
    private BigDecimal executedPrice;
    private BigDecimal newBalance;
    private BigDecimal fee;
    private String orderId;       // Order ID (used when cancelling a limit order)
    private String orderMode;     // "market" | "limit"
}



