package com.spotchzxk.service;

import com.spotchzxk.entity.DividendLog;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.DividendLogRepository;
import com.spotchzxk.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class DividendService {

    private final UserShareRepository userShareRepository;
    private final DividendLogRepository dividendLogRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public void payStreamEndDividend(Stock stock, long streamMinutes) {
        BigDecimal pool = stock.getDividendPool();
        if (stock.getTotalSupply() <= 0 || pool == null || pool.compareTo(BigDecimal.ZERO) <= 0) return;

        BigDecimal calculatedRate = pool.divide(BigDecimal.valueOf(stock.getTotalSupply()), 4, RoundingMode.HALF_UP);

        int updatedUsers = userShareRepository.distributeDividends(stock.getChannelId(), calculatedRate);

        if (updatedUsers > 0) {
            DividendLog logEntry = DividendLog.builder()
                    .stock(stock)
                    .totalDividendPool(pool.intValue())
                    .payoutReason("stream-end")
                    .streamMinutes(streamMinutes)
                    .build();
            dividendLogRepository.save(logEntry);
            log.info("Stream-end dividend for channel {}: pool={}, rate={}, {} users",
                    stock.getChannelId(), pool, calculatedRate, updatedUsers);

            messagingTemplate.convertAndSend("/topic/dividends", Map.of(
                    "channelId", stock.getChannelId(),
                    "streamerName", stock.getStreamerName(),
                    "profileImageUrl", stock.getProfileImageUrl() != null ? stock.getProfileImageUrl() : "",
                    "totalDividendPool", pool.intValue(),
                    "streamMinutes", streamMinutes,
                    "createdAt", logEntry.getCreatedAt().toString()
            ));
        }

        stock.setDividendPool(BigDecimal.ZERO);
    }
}
