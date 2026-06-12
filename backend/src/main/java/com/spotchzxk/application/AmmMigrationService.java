package com.spotchzxk.application;

import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
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
import java.math.BigInteger;

/**
 * One-time migration: initializes AMM pools for existing stocks using current price as seed.
 * Runs at startup before July 1 launch; becomes a no-op once all stocks are migrated.
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
                if (stock.getCoinReserve().signum() > 0 && stock.getShareReserve().signum() > 0) {
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
        long tierReserve = calcTierShareReserve(stock.getFollowerCount());

        // Use 2x current held quantity as share reserve floor (generous headroom for sells)
        long shareReserve = Math.max(totalHeld * 2, tierReserve);
        if (shareReserve < 100) shareReserve = 100; // 理쒖냼 蹂댁옣
        BigInteger coinReserve = BigInteger.valueOf(currentPrice).multiply(BigInteger.valueOf(shareReserve));

        stock.initAmmPool(coinReserve, BigInteger.valueOf(shareReserve), tier);
        // issuedShares must match user_shares sum after migration, not the stale DB value
        stockRepository.save(stock);
        String channelId = stock.getChannelId();
        registerAfterCommit(() -> tradeEngine.evictStockCache(channelId));

        log.info("Migrated {}: price={}, issuedShares={}, shareReserve={}, coinReserve={}, tier={}",
                stock.getStreamerName(), currentPrice, totalHeld, shareReserve, coinReserve, tier);
    }

    public static int calcLiquidityTier(long followerCount) {
        if (followerCount < 2_000)     return 1;
        if (followerCount < 20_000)    return 2;
        if (followerCount < 200_000)   return 3;
        if (followerCount < 1_000_000) return 4;
        return 5;
    }

    public static long calcTierShareReserve(long followerCount) {
        if (followerCount < 2_000)     return 50_000L;
        if (followerCount < 20_000)    return 100_000L;
        if (followerCount < 200_000)   return 200_000L;
        if (followerCount < 1_000_000) return 400_000L;
        return 800_000L;
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


