package com.spotchzxk.dto;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter @Setter
public class TradeRequest {

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
}
