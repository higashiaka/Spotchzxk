package com.spotchzxk.presentation.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

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

    @Min(1)
    private long quantity;

    @NotNull
    private BigDecimal estimatedPrice;

    @Pattern(regexp = "market|limit")
    private String orderMode = "market";

    @DecimalMin("0.01")
    private BigDecimal limitPrice;

    /** Buy slippage guard: max coins to spend; order is rejected if actual cost exceeds this (null = no limit) */
    @Min(1)
    private Long maxCoinIn;

    /** Sell slippage guard: min coins to receive; order is rejected if proceeds fall below this (null = no limit) */
    @Min(1)
    private Long minCoinOut;

    /** Allow partial fill (limit orders only) */
    private boolean allowPartial = false;
}


