package com.spotchzxk.service;

import com.spotchzxk.entity.Stock;
import com.spotchzxk.dto.OrderBookDto;
import com.spotchzxk.exception.ChannelNotFoundException;
import com.spotchzxk.exception.InsufficientFollowerCountException;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.StockRepository;
import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.math.BigDecimal;
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

    public List<Stock> getAllStocks() {
        return stockRepository.findAll();
    }

    public OrderBookDto getOrderBook(String channelId, int depth) {
        Stock stock = stockRepository.findById(channelId)
                .orElseThrow(() -> new IllegalStateException("Stock not found."));
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
    @Transactional
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
                .isLive(false)
                .listedAt(java.time.LocalDateTime.now())
                .build();

        if (!chzzkApiClient.populateChannelInfo(stock)) {
            throw new ChannelNotFoundException(channelId);
        }

        if (stock.getFollowerCount() < MIN_FOLLOWER_COUNT) {
            throw new InsufficientFollowerCountException(channelId, stock.getFollowerCount());
        }

        var user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
        if (user.getStockAddTickets() <= 0) {
            throw new IllegalStateException("종목 추가 티켓이 없습니다.");
        }
        user.useStockAddTicket();
        userRepository.save(user);
        tradeEngine.evictUserCache(userId);

        int listingPrice = calcListingPrice(stock.getFollowerCount());
        stock.finalizeListing(listingPrice, 100_000L);
        stockRepository.save(stock);

        messagingTemplate.convertAndSend("/topic/streamers", stockRepository.findAll());
        return Optional.of(stockRepository.findById(channelId).orElseThrow());
    }

    private static int calcListingPrice(int followerCount) {
        if (followerCount <= 0) {
            return 10_000;
        }
        int raw = (int) (Math.sqrt(followerCount) * 300);
        int rounded = (raw / 1_000) * 1_000;
        return Math.max(10_000, Math.min(300_000, rounded));
    }
}
