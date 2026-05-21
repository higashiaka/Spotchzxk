package com.spotchzxk.service;

import com.spotchzxk.entity.DividendLog;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.UserDividendLog;
import com.spotchzxk.entity.UserShare;
import com.spotchzxk.repository.DividendLogRepository;
import com.spotchzxk.repository.UserDividendLogRepository;
import com.spotchzxk.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class DividendService {

    // 배당세: 총 풀의 20%를 소각하여 코인 순증 억제
    private static final BigDecimal DIVIDEND_TAX_RATE = new BigDecimal("0.20");

    private final UserShareRepository userShareRepository;
    private final UserDividendLogRepository userDividendLogRepository;
    private final DividendLogRepository dividendLogRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final TradeEngine tradeEngine;

    @Transactional
    public void payIntervalDividend(Stock stock) {
        // 실제 유통량: 스트림 시작 시점 스냅샷 기준, 하우스 제외
        long actualFloat = userShareRepository.sumPreStreamQuantityByChannel(stock.getChannelId());
        if (actualFloat <= 0) return;

        int hours = Math.max(1, stock.getBaseBroadcastHours());
        BigDecimal fixedPool = BigDecimal.valueOf(stock.getCurrentPrice())
                .multiply(BigDecimal.valueOf(0.10))
                .multiply(BigDecimal.valueOf(hours))
                .setScale(4, RoundingMode.HALF_UP);
        BigDecimal grossRatePerShare = fixedPool
                .divide(BigDecimal.valueOf(actualFloat), 4, RoundingMode.HALF_UP);

        // 배당세 20% 적용: 실제 지급액 = 총 풀의 80%
        BigDecimal ratePerShare = grossRatePerShare
                .multiply(BigDecimal.ONE.subtract(DIVIDEND_TAX_RATE))
                .setScale(4, RoundingMode.HALF_UP);

        if (ratePerShare.compareTo(BigDecimal.ZERO) <= 0) return;

        int updatedUsers = userShareRepository.distributeDividends(stock.getChannelId(), ratePerShare);

        if (updatedUsers > 0) {
            List<UserShare> shares = userShareRepository.findByStockChannelIdWithPositiveQuantity(stock.getChannelId());
            List<UserDividendLog> logs = shares.stream()
                    .filter(us -> us.getPreStreamQuantity() > 0)
                    .map(us -> UserDividendLog.builder()
                            .userId(us.getUser().getId())
                            .channelId(stock.getChannelId())
                            .streamerName(stock.getStreamerName())
                            .profileImageUrl(stock.getProfileImageUrl())
                            .quantity(us.getPreStreamQuantity())
                            .ratePerShare(ratePerShare)
                            .amount(ratePerShare.multiply(BigDecimal.valueOf(us.getPreStreamQuantity()))
                                    .setScale(2, RoundingMode.HALF_UP))
                            .build())
                    .collect(Collectors.toList());
            userDividendLogRepository.saveAll(logs);

            // 배당 수령 대상(pre_stream_quantity 기준)의 캐시 갱신 — logs 기반으로 정확히 특정
            logs.forEach(log -> tradeEngine.evictUserCache(log.getUserId()));

            BigDecimal actualPaid = ratePerShare.multiply(BigDecimal.valueOf(actualFloat))
                    .setScale(0, RoundingMode.HALF_UP);
            BigDecimal taxBurned = grossRatePerShare.subtract(ratePerShare)
                    .multiply(BigDecimal.valueOf(actualFloat))
                    .setScale(0, RoundingMode.HALF_UP);
            DividendLog logEntry = DividendLog.builder()
                    .stock(stock)
                    .totalDividendPool(actualPaid.intValue())
                    .payoutReason("interval")
                    .streamMinutes(null)
                    .build();
            dividendLogRepository.save(logEntry);

            log.info("Interval dividend for channel {}: fixedPool={}, float={}/{}, ratePerShare={} (gross={}, taxBurned={}), {} users",
                    stock.getChannelId(), fixedPool, actualFloat, stock.getTotalSupply(), ratePerShare, grossRatePerShare, taxBurned, updatedUsers);

            messagingTemplate.convertAndSend("/topic/dividends", Map.of(
                    "channelId", stock.getChannelId(),
                    "streamerName", stock.getStreamerName(),
                    "profileImageUrl", stock.getProfileImageUrl() != null ? stock.getProfileImageUrl() : "",
                    "ratePerShare", ratePerShare,
                    "streamMinutes", 0L,
                    "createdAt", LocalDateTime.now().toString()
            ));
        }
    }
}
