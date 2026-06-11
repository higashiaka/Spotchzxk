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

/**
 * 踰좏? 留덉씠洹몃젅?댁뀡: 湲곗〈 醫낅ぉ??AMM ????꾩옱媛 湲곗??쇰줈 珥덇린??
 * 7??1???쒖쫵 由ъ뀑 ?꾩뿉???붾줈??湲곕컲 怨듭떇?쇰줈 ?泥대맖.
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
        long tierReserve = calcTierShareReserve(stock.getFollowerCount());

        // 湲곗〈 蹂댁쑀?됱쓽 2諛곗? ?곗뼱 湲곗? 以?????媛??ъ슜 (留ㅻ룄 ?뺣젰 媛먮떦)
        long shareReserve = Math.max(totalHeld * 2, tierReserve);
        if (shareReserve < 100) shareReserve = 100; // 理쒖냼 蹂댁옣
        long coinReserve = currentPrice * shareReserve;

        stock.initAmmPool(coinReserve, shareReserve, tier);
        // issuedShares媛 user_shares ?ㅻ낫?좊웾怨??щ씪吏????덉쑝誘濡?留덉씠洹몃젅?댁뀡 ???숆린??        stock.syncIssuedShares(totalHeld);
        stockRepository.save(stock);
        String channelId = stock.getChannelId();
        registerAfterCommit(() -> tradeEngine.evictStockCache(channelId));

        log.info("Migrated {}: price={}, issuedShares={}, shareReserve={}, coinReserve={}, tier={}",
                stock.getStreamerName(), currentPrice, totalHeld, shareReserve, coinReserve, tier);
    }

    public static int calcLiquidityTier(int followerCount) {
        if (followerCount < 2_000)     return 1;
        if (followerCount < 20_000)    return 2;
        if (followerCount < 200_000)   return 3;
        if (followerCount < 1_000_000) return 4;
        return 5;
    }

    public static long calcTierShareReserve(int followerCount) {
        if (followerCount < 2_000)     return 3_000L;
        if (followerCount < 20_000)    return 5_000L;
        if (followerCount < 200_000)   return 12_000L;
        if (followerCount < 1_000_000) return 30_000L;
        return 80_000L;
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


