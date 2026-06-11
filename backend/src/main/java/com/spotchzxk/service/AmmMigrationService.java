package com.spotchzxk.service;

import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

/**
 * 베타 마이그레이션: 기존 종목의 AMM 풀을 현재가 기준으로 초기화.
 * 7월 1일 시즌 리셋 후에는 팔로워 기반 공식으로 대체됨.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AmmMigrationService implements ApplicationRunner {

    private final StockRepository stockRepository;
    private final UserShareRepository userShareRepository;
    private final TradeEngine tradeEngine;
    private final PlatformTransactionManager txManager;

    @Override
    public void run(ApplicationArguments args) {
        migrateAll();
    }

    public void migrateAll() {
        List<Stock> stocks = stockRepository.findAll();
        int migrated = 0;
        int synced = 0;
        for (Stock stock : stocks) {
            try {
                if (stock.getCoinReserve() > 0 && stock.getShareReserve() > 0) {
                    long totalHeld = userShareRepository.sumQuantityByStock(stock.getChannelId());
                    if (stock.getIssuedShares() != totalHeld) {
                        new TransactionTemplate(txManager).executeWithoutResult(s -> {
                            stock.syncIssuedShares(totalHeld);
                            stockRepository.save(stock);
                        });
                        synced++;
                    }
                    continue;
                }
                new TransactionTemplate(txManager).executeWithoutResult(s -> migrateStock(stock));
                migrated++;
            } catch (Exception e) {
                log.error("AMM migration failed for {}: {}", stock.getChannelId(), e.getMessage(), e);
            }
        }
        log.info("AMM migration complete: {} stocks migrated, {} issuedShares synced.", migrated, synced);
    }

    private void migrateStock(Stock stock) {
        long currentPrice = Math.max(1, stock.getCurrentPrice());
        long totalHeld = userShareRepository.sumQuantityByStock(stock.getChannelId());
        int tier = calcLiquidityTier(stock.getFollowerCount());
        long tierReserve = calcTierShareReserve(stock.getFollowerCount(), currentPrice);

        // 기존 보유량의 2배와 티어 기준 중 더 큰 값 사용 (매도 압력 감당)
        long shareReserve = Math.max(totalHeld * 2, tierReserve);
        if (shareReserve < 100) shareReserve = 100; // 최소 보장
        long coinReserve = currentPrice * shareReserve;

        stock.initAmmPool(coinReserve, shareReserve, tier);
        // issuedShares가 user_shares 실보유량과 달라질 수 있으므로 마이그레이션 시 동기화
        stock.syncIssuedShares(totalHeld);
        stockRepository.save(stock);
        String channelId = stock.getChannelId();
        registerAfterCommit(() -> tradeEngine.evictStockCache(channelId));

        log.info("Migrated {}: price={}, issuedShares={}, shareReserve={}, coinReserve={}, tier={}",
                stock.getStreamerName(), currentPrice, totalHeld, shareReserve, coinReserve, tier);
    }

    public static int calcLiquidityTier(int followerCount) {
        if (followerCount < 10_000)    return 1;
        if (followerCount < 100_000)   return 2;
        if (followerCount < 1_000_000) return 3;
        return 4;
    }

    /**
     * 신규 상장 시 티어 기반 shareReserve 계산.
     * 목표 10% 펌핑 비용: pumpCostTarget = price × shareReserve × 0.04881
     * 0.04881 ≈ buyCost(1, N, 0.1*N) / (price * N)  — x*y=k 모델에서 10% 펌핑에 필요한 코인 비율
     */
    public static long calcTierShareReserve(int followerCount, long initialPrice) {
        long pumpCostTarget = calcPumpCostTarget(followerCount);
        long shareReserve = (long) (pumpCostTarget / (initialPrice * 0.04881));
        return Math.max(100, shareReserve);
    }

    static long calcPumpCostTarget(int followerCount) {
        if (followerCount < 10_000)    return 240_000L;
        if (followerCount < 100_000)   return 2_440_000L;
        if (followerCount < 1_000_000) return 24_400_000L;
        return 244_000_000L;
    }

    private void registerAfterCommit(Runnable task) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            task.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                task.run();
            }
        });
    }
}
