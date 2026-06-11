package com.spotchzxk.presentation.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter @Setter
public class TradeRequest {

    // Issue #3: ?대씪?댁뼵??JSON?먯꽌 userId ??쭅?ы솕 李⑤떒 ??而⑦듃濡ㅻ윭?먯꽌 SecurityContext 媛믪쑝濡쒕쭔 ?ㅼ젙
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

    /** 留ㅼ닔 ?щ━?쇱? 蹂댄샇: ??湲덉븸 珥덇낵 ??泥닿껐 嫄곕? (null = 臾댁젣?? */
    @Min(1)
    private Long maxCoinIn;

    /** 留ㅻ룄 ?щ━?쇱? 蹂댄샇: ??湲덉븸 誘몃쭔 ??泥닿껐 嫄곕? (null = 臾댁젣?? */
    @Min(1)
    private Long minCoinOut;

    /** 遺遺?泥닿껐 ?덉슜 ?щ? (吏?뺢? ?꾩슜) */
    private boolean allowPartial = false;
}


