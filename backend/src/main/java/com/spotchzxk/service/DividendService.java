package com.spotchzxk.service;

import com.spotchzxk.entity.DividendLog;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.DividendLogRepository;
import com.spotchzxk.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Service
@RequiredArgsConstructor
@Slf4j
public class DividendService {

    private final UserShareRepository userShareRepository;
    private final DividendLogRepository dividendLogRepository;

    private static final int BASE_DIVIDEND_UNIT = 100;

    @Transactional
    public void payStreamEndDividend(Stock stock, long streamMinutes) {
        if (stock.getTotalSupply() <= 0 || streamMinutes <= 0) return;

        // totalPool = BASE_UNIT * weight * (streamMinutes / 60)
        long totalPool = (long) (BASE_DIVIDEND_UNIT
                * Math.max(1, stock.getBaseBroadcastHours())
                * streamMinutes / 60.0);

        if (totalPool <= 0) return;

        BigDecimal calculatedRate = BigDecimal.valueOf(totalPool)
                .divide(BigDecimal.valueOf(stock.getTotalSupply()), 4, RoundingMode.HALF_UP);

        int updatedUsers = userShareRepository.distributeDividends(stock.getChannelId(), calculatedRate);

        if (updatedUsers > 0) {
            DividendLog logEntry = DividendLog.builder()
                    .stock(stock)
                    .totalDividendPool((int) totalPool)
                    .payoutReason("stream-end")
                    .streamMinutes(streamMinutes)
                    .build();
            dividendLogRepository.save(logEntry);
            log.info("Stream-end dividend for channel {}: {}min → pool {}, rate {}, {} users",
                    stock.getChannelId(), streamMinutes, totalPool, calculatedRate, updatedUsers);
        }
    }
}
