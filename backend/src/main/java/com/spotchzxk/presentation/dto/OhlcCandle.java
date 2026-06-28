package com.spotchzxk.presentation.dto;

import lombok.*;
import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OhlcCandle {
    private long bucketStart;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private BigDecimal open;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private BigDecimal high;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private BigDecimal low;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private BigDecimal close;
}


