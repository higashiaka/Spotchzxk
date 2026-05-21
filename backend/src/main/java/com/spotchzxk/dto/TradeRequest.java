package com.spotchzxk.dto;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter @Setter
public class TradeRequest {

    @NotBlank
    private String userId;

    @NotBlank
    private String streamerId;

    @NotBlank
    @Pattern(regexp = "buy|sell")
    private String type;

    @Min(1)
    private int quantity;

    @NotNull
    @DecimalMin("0.01")
    private BigDecimal estimatedPrice;

    /** 주문 방식: "market"(기본) | "limit" */
    @Pattern(regexp = "market|limit")
    private String orderMode = "market";

    /** 지정가 — orderMode="limit" 일 때만 필수 */
    @DecimalMin("0.01")
    private BigDecimal limitPrice;
}
