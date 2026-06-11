package com.spotchzxk.service;

import com.spotchzxk.dto.OrderBookDto;
import com.spotchzxk.entity.Stock;
import com.spotchzxk.entity.User;
import com.spotchzxk.exception.ChannelNotFoundException;
import com.spotchzxk.exception.InsufficientFollowerCountException;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StockService {

    private static final int MIN_FOLLOWER_COUNT = 100;

    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ChzzkApiClient chzzkApiClient;
    private final TradeEngine tradeEngine;
    private final TransactionTemplate transactionTemplate;

    public List<Stock> getAllStocks() {
        return stockRepository.findAll();
    }

    public OrderBookDto getOrderBook(String channelId, int depth) {
        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("종목 정보를 찾을 수 없습니다."));
        int safeDepth = Math.max(1, Math.min(depth, 20));
        return new OrderBookDto(
                channelId,
                BigDecimal.valueOf(stock.getCurrentPrice()),
                toOrderBookEntries(orderRepository.findAskLevels(channelId, safeDepth)),
                toOrderBookEntries(orderRepository.findBidLevels(channelId, safeDepth))
        );
    }

    private List<OrderBookDto.OrderBookEntry> toOrderBookEntries(List<Object[]> rows) {
        return rows.stream()
                .map(row -> new OrderBookDto.OrderBookEntry(
                        row[0] instanceof BigDecimal price ? price : new BigDecimal(String.valueOf(row[0])),
                        ((Number) row[1]).longValue()
                ))
                .collect(Collectors.toList());
    }

    /**
     * @return empty if stock already exists, filled if newly created with Chzzk API name.
     */
    public Optional<Stock> addStockIfNew(String userId, String channelId) {
        if (stockRepository.existsById(channelId)) {
            return Optional.empty();
        }

        Stock stock = Stock.builder()
                .channelId(channelId)
                .streamerName(channelId)
                .totalSupply(0L)
                .currentPrice(1000)
                .basePrice(1000)
                .listingPrice(1000)
                .isLive(false)
                .listedAt(java.time.LocalDateTime.now())
                .build();

        // Issue #21: Chzzk API 호출은 잠금 내부의 두 번째 existsById 검사 이후로 이동 (TOCTOU)
        AtomicReference<Optional<Stock>> result = new AtomicReference<>(Optional.empty());
        tradeEngine.runWithUserLock(userId, () -> result.set(transactionTemplate.execute(status ->
                addStockIfNewLocked(userId, channelId, stock))));

        result.get().ifPresent(savedStock ->
                messagingTemplate.convertAndSend("/topic/streamers", stockRepository.findAll()));
        return result.get();
    }

    private Optional<Stock> addStockIfNewLocked(String userId, String channelId, Stock stock) {
        if (stockRepository.existsById(channelId)) {
            return Optional.empty();
        }

        // Issue #21: Chzzk API는 두 번째 existsById 이후 — 이미 등록된 채널에 네트워크 요청을 낭비하지 않음
        if (!chzzkApiClient.populateChannelInfo(stock)) {
            throw new ChannelNotFoundException(channelId);
        }
        if (stock.getFollowerCount() < MIN_FOLLOWER_COUNT) {
            throw new InsufficientFollowerCountException(channelId, stock.getFollowerCount());
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));
        if (user.getStockAddTickets() <= 0) {
            throw new IllegalStateException("종목 추가권이 없습니다.");
        }
        if (userRepository.useStockAddTicket(userId) != 1) {
            throw new IllegalStateException("종목 추가권이 없습니다.");
        }
        tradeEngine.evictUserCache(userId);

        long listingPrice = calcListingPrice(stock.getFollowerCount());
        stock.finalizeListing(listingPrice, 100_000L);

        int tier = AmmMigrationService.calcLiquidityTier(stock.getFollowerCount());
        long shareReserve = AmmMigrationService.calcTierShareReserve(stock.getFollowerCount(), listingPrice);
        long coinReserve = (long) listingPrice * shareReserve;
        stock.initAmmPool(coinReserve, shareReserve, tier);

        stockRepository.save(stock);

        return Optional.of(stockRepository.findById(channelId).orElseThrow());
    }

    private static long calcListingPrice(int followerCount) {
        if (followerCount <= 0) {
            return 10_000L;
        }
        long raw = (long) (Math.sqrt(followerCount) * 300);
        long rounded = (raw / 1_000) * 1_000;
        return Math.max(10_000L, Math.min(300_000L, rounded));
    }
}
