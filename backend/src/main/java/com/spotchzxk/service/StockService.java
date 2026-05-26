package com.spotchzxk.service;

import com.spotchzxk.entity.Stock;
import com.spotchzxk.exception.ChannelNotFoundException;
import com.spotchzxk.exception.InsufficientFollowerCountException;
import com.spotchzxk.repository.StockRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class StockService {

    private static final int MIN_FOLLOWER_COUNT = 100;

    private final StockRepository stockRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ChzzkApiClient chzzkApiClient;

    public List<Stock> getAllStocks() {
        return stockRepository.findAll();
    }

    /**
     * @return empty if stock already exists, filled if newly created with Chzzk API name.
     */
    @Transactional
    public Optional<Stock> addStockIfNew(String channelId) {
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

        int listingPrice = calcListingPrice(stock.getFollowerCount());
        stock.setCurrentPrice(listingPrice);
        stock.setBasePrice(listingPrice);
        stock.setTotalSupply(100_000L);
        stock.setIssuedShares(0L);
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
