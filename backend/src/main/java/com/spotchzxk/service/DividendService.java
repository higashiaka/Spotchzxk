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

    private final UserShareRepository userShareRepository;
    private final UserDividendLogRepository userDividendLogRepository;
    private final DividendLogRepository dividendLogRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public void payIntervalDividend(Stock stock) {
        if (stock.getTotalSupply() <= 0) return;

        BigDecimal ratePerShare = BigDecimal.valueOf(stock.getCurrentPrice())
                .multiply(BigDecimal.valueOf(0.05))
                .divide(BigDecimal.valueOf(stock.getTotalSupply()), 4, RoundingMode.HALF_UP);

        if (ratePerShare.compareTo(BigDecimal.ZERO) <= 0) return;

        int updatedUsers = userShareRepository.distributeDividends(stock.getChannelId(), ratePerShare);

        if (updatedUsers > 0) {
            List<UserShare> shares = userShareRepository.findByStockChannelIdWithPositiveQuantity(stock.getChannelId());
            List<UserDividendLog> logs = shares.stream()
                    .map(us -> UserDividendLog.builder()
                            .userId(us.getUser().getId())
                            .channelId(stock.getChannelId())
                            .streamerName(stock.getStreamerName())
                            .profileImageUrl(stock.getProfileImageUrl())
                            .quantity(us.getQuantity())
                            .ratePerShare(ratePerShare)
                            .amount(ratePerShare.multiply(BigDecimal.valueOf(us.getQuantity()))
                                    .setScale(2, RoundingMode.HALF_UP))
                            .build())
                    .collect(Collectors.toList());
            userDividendLogRepository.saveAll(logs);

            DividendLog logEntry = DividendLog.builder()
                    .stock(stock)
                    .totalDividendPool(ratePerShare.multiply(BigDecimal.valueOf(stock.getTotalSupply()))
                            .setScale(0, RoundingMode.HALF_UP).intValue())
                    .payoutReason("interval")
                    .streamMinutes(null)
                    .build();
            dividendLogRepository.save(logEntry);

            log.info("Interval dividend for channel {}: ratePerShare={}, {} users",
                    stock.getChannelId(), ratePerShare, updatedUsers);

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
