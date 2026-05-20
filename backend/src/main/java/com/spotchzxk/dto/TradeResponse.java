package com.spotchzxk.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.math.BigDecimal;

@Getter
@AllArgsConstructor
public class TradeResponse {
    private String status;
    private BigDecimal executedPrice;
    private BigDecimal newBalance;
    private BigDecimal fee;
}
