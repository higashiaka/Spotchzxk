package com.spotchzxk.presentation.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OhlcCandle {
    private long bucketStart;
    private double open;
    private double high;
    private double low;
    private double close;
}


