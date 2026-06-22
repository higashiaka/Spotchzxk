package com.spotchzxk.presentation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class TradeResponse {
    private String status;        // "executed" | "pending"
    private String executedPrice;
    private String newBalance;
    private String fee;
    private String orderId;
    private String orderMode;     // "market" | "limit"
}
