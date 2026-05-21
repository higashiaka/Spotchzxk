package com.spotchzxk.dto;

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
    private String orderId;       // 주문 ID (지정가 취소 시 사용)
    private String orderMode;     // "market" | "limit"
}

