package com.spotchzxk.service;

import com.spotchzxk.entity.DividendLog;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.DividendLogRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class DividendService {

    private final StockRepository stockRepository;
    private final UserShareRepository userShareRepository;
    private final DividendLogRepository dividendLogRepository;

    private static final int BASE_DIVIDEND_UNIT = 100;

    @Scheduled(cron = "0 */10 * * * *")
    @Transactional
    public void processLiveDividends() {
        log.info("Starting batch dividend processing for live streams");
        List<Stock> liveStocks = stockRepository.findByIsLiveTrue();
        
        for (Stock stock : liveStocks) {
            if (stock.getTotalSupply() <= 0) continue;
            
            // Total_Pool_per_Slot = Base_Dividend_Unit * Broadcast_Hours_Weight (using baseBroadcastHours as weight)
            int totalPoolPerSlot = BASE_DIVIDEND_UNIT * Math.max(1, stock.getBaseBroadcastHours());
            
            // calculatedRate = totalPoolPerSlot / Total_Issued_Supply
            BigDecimal calculatedRate = BigDecimal.valueOf(totalPoolPerSlot)
                    .divide(BigDecimal.valueOf(stock.getTotalSupply()), 4, RoundingMode.HALF_UP);
                    
            if (calculatedRate.compareTo(BigDecimal.ZERO) <= 0) continue;

            int updatedUsersCount = userShareRepository.distributeDividends(stock.getChannelId(), calculatedRate);

            if (updatedUsersCount > 0) {
                DividendLog logEntry = DividendLog.builder()
                        .stock(stock)
                        .totalDividendPool(totalPoolPerSlot)
                        .payoutReason("10-min batch live dividend")
                        .build();
                dividendLogRepository.save(logEntry);
                log.info("Distributed dividends for channel {}: pool {}, rate {}, updated users {}", 
                        stock.getChannelId(), totalPoolPerSlot, calculatedRate, updatedUsersCount);
            }
        }
        log.info("Finished batch dividend processing");
    }
}
