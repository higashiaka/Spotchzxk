package com.spotchzxk.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter @Setter
public class TradeRequest {

    // Issue #3: 클라이언트 JSON에서 userId 역직렬화 차단 — 컨트롤러에서 SecurityContext 값으로만 설정
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
    @DecimalMin("0.01")
    private BigDecimal estimatedPrice;

    @Pattern(regexp = "market|limit")
    private String orderMode = "market";

    @DecimalMin("0.01")
    private BigDecimal limitPrice;

    /** 매수 슬리피지 보호: 이 금액 초과 시 체결 거부 (null = 무제한) */
    @Min(1)
    private Long maxCoinIn;

    /** 매도 슬리피지 보호: 이 금액 미만 시 체결 거부 (null = 무제한) */
    @Min(1)
    private Long minCoinOut;

    /** 부분 체결 허용 여부 (지정가 전용) */
    private boolean allowPartial = false;
}
