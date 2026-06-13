package com.spotchzxk.presentation.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.math.BigDecimal;

@Getter
@AllArgsConstructor
public class TradeResponse {
    private String status;        // "executed" | "pending"
    private BigDecimal executedPrice;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal newBalance;
    private BigDecimal fee;
    private String orderId;
    private String orderMode;     // "market" | "limit"
}
