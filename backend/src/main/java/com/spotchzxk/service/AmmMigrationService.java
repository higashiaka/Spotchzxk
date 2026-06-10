package com.spotchzxk.service;

import com.spotchzxk.entity.Stock;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

/**
 * 베타 마이그레이션: 기존 종목의 AMM 풀을 현재가 기준으로 초기화.
 * 7월 1일 시즌 리셋 후에는 팔로워 기반 공식으로 대체됨.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AmmMigrationService {

    private final StockRepository stockRepository;
    private final UserShareRepository userShareRepository;
    private final TradeEngine tradeEngine;

    @Transactional
    public void migrateAll() {
        List<Stock> stocks = stockRepository.findAll();
        int migrated = 0;
        for (Stock stock : stocks) {
            if (stock.getCoinReserve() > 0) {
                log.info("Skipping already migrated stock: {}", stock.getChannelId());
                continue;
            }
            migrateStock(stock);
            migrated++;
        }
        log.info("AMM migration complete: {} stocks migrated.", migrated);
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
        stockRepository.save(stock);
        String channelId = stock.getChannelId();
        registerAfterCommit(() -> tradeEngine.evictStockCache(channelId));

        log.info("Migrated {}: price={}, shareReserve={}, coinReserve={}, tier={}",
                stock.getStreamerName(), currentPrice, shareReserve, coinReserve, tier);
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
