package com.spotchzxk.application;

import com.spotchzxk.presentation.dto.OrderBookDto;
import com.spotchzxk.presentation.dto.StockResponse;
import com.spotchzxk.domain.stock.entity.Stock;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.shared.exception.ChannelNotFoundException;
import com.spotchzxk.shared.exception.InsufficientFollowerCountException;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.infrastructure.chzzk.ChzzkApiClient;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import org.springframework.dao.DataIntegrityViolationException;

import java.math.BigDecimal;
import java.math.BigInteger;
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

    public List<StockResponse> getAllStocks() {
        return stockRepository.findAll().stream().map(StockResponse::from).toList();
    }

    public OrderBookDto getOrderBook(String channelId, int depth) {
        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("종목 정보를 찾을 수 없습니다."));
        int safeDepth = Math.max(1, Math.min(depth, 20));
        return new OrderBookDto(
                channelId,
                stock.getCurrentPrice(),
                toOrderBookEntries(orderRepository.findAskLevels(channelId, safeDepth)),
                toOrderBookEntries(orderRepository.findBidLevels(channelId, safeDepth))
        );
    }

    private List<OrderBookDto.OrderBookEntry> toOrderBookEntries(List<Object[]> rows) {
        return rows.stream()
                .map(row -> new OrderBookDto.OrderBookEntry(
                        row[0] instanceof BigDecimal price ? price : new BigDecimal(String.valueOf(row[0])),
                        row[1] instanceof BigDecimal qty ? qty : new BigDecimal(String.valueOf(row[1]))
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
                .totalSupply(BigDecimal.ZERO)
                .currentPrice(BigDecimal.valueOf(1000))
                .basePrice(BigDecimal.valueOf(1000))
                .listingPrice(BigDecimal.valueOf(1000))
                .isLive(false)
                .listedAt(java.time.LocalDateTime.now())
                .build();

        // user lock prevents TOCTOU for the same user; DataIntegrityViolationException handles
        // the rare race where two different users register the same channelId concurrently.
        AtomicReference<Optional<Stock>> result = new AtomicReference<>(Optional.empty());
        try {
            tradeEngine.runWithUserLock(userId, () -> result.set(transactionTemplate.execute(status ->
                    addStockIfNewLocked(userId, channelId, stock))));
        } catch (DataIntegrityViolationException e) {
            return Optional.empty(); // already inserted by a concurrent request
        }

        result.get().ifPresent(savedStock ->
                messagingTemplate.convertAndSend("/topic/streamers",
                        stockRepository.findAll().stream().map(StockResponse::from).toList()));
        return result.get();
    }

    private Optional<Stock> addStockIfNewLocked(String userId, String channelId, Stock stock) {
        if (stockRepository.existsById(channelId)) {
            return Optional.empty();
        }

        // Issue #21: re-fetch channel info inside the lock; swallow nothing — let ChannelNotFoundException propagate
        if (!chzzkApiClient.populateChannelInfo(stock)) {
            throw new ChannelNotFoundException(channelId);
        }
        if (stock.getFollowerCount() < MIN_FOLLOWER_COUNT) {
            throw new InsufficientFollowerCountException(channelId, stock.getFollowerCount());
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));
        if (user.getStockAddTickets() <= 0) {
            throw new IllegalStateException("채널 등록권이 없습니다.");
        }
        if (userRepository.useStockAddTicket(userId) != 1) {
            throw new IllegalStateException("채널 등록권이 없습니다.");
        }
        tradeEngine.evictUserCache(userId);

        long listingPrice = calcListingPrice(stock.getFollowerCount());
        stock.finalizeListing(listingPrice, 100_000L);

        int tier = AmmMigrationService.calcLiquidityTier(stock.getFollowerCount());
        long shareReserve = AmmMigrationService.calcTierShareReserve(stock.getFollowerCount());
        BigInteger coinReserve = BigInteger.valueOf(listingPrice).multiply(BigInteger.valueOf(shareReserve));
        stock.initAmmPool(coinReserve, BigInteger.valueOf(shareReserve), tier);

        stockRepository.save(stock);

        return Optional.of(stockRepository.findById(channelId).orElseThrow());
    }

    private static long calcListingPrice(long followerCount) {
        if (followerCount <= 0) {
            return 10_000L;
        }
        long raw = (long) (Math.sqrt(followerCount) * 300);
        long rounded = (raw / 1_000) * 1_000;
        return Math.max(10_000L, Math.min(300_000L, rounded));
    }
}


