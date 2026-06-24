package com.spotchzxk.presentation.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.math.BigInteger;

@Getter @Setter
public class TradeRequest {

    // Issue #3: userId must not come from the JSON body; always resolved from SecurityContext to prevent spoofing
    @JsonIgnore
    private String userId;

    @NotBlank
    private String streamerId;

    @NotBlank
    @Pattern(regexp = "buy|sell")
    private String type;

    @NotNull
    @Positive
    private BigInteger quantity;

    @NotNull
    private BigDecimal estimatedPrice;

    @Pattern(regexp = "market|limit")
    private String orderMode = "market";

    @DecimalMin("0.01")
    private BigDecimal limitPrice;

    /** Buy slippage guard: max coins to spend; order is rejected if actual cost exceeds this (null = no limit) */
    @DecimalMin("1")
    private BigDecimal maxCoinIn;

    /** Sell slippage guard: min coins to receive; order is rejected if proceeds fall below this (null = no limit) */
    @DecimalMin("1")
    private BigDecimal minCoinOut;

    /** Allow partial fill (limit orders only) */
    private boolean allowPartial = false;

    /** Sell the entire DB holding, including a legacy fractional remainder (market sell only). */
    private boolean sellAll = false;
}


