package com.spotchzxk.presentation.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OhlcCandle {
    private long bucketStart;
    private long open;
    private long high;
    private long low;
    private long close;
}


