package com.spotchzxk.service;

import com.spotchzxk.dto.OrderBookDto;
import com.spotchzxk.dto.TradeRequest;
import com.spotchzxk.dto.TradeResponse;
import com.spotchzxk.entity.*;
import com.spotchzxk.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class TradeEngine {

    private static final BigDecimal MIN_PRICE = BigDecimal.ONE;
    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);
    private static final BigDecimal TRADE_FEE_RATE = new BigDecimal("0.01");
    private static final long INITIAL_SUPPLY = 100_000L;
    private static final long MAX_HOLDING_PER_STOCK = INITIAL_SUPPLY / 10;  // 1인 최대 10%
    private static final int TRANCHE_COUNT = 10;                             // 하우스 호가 분할 수
    private static final String HOUSE_USER_ID = "__house__";

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final StockRepository stockRepository;
    private final OrderRepository orderRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final PlatformTransactionManager txManager;
    private final CandleService candleService;

    // ── 읽기 캐시 (반복 SELECT 방지) ─────────────────────────────────────────────
    private final ConcurrentHashMap<String, BigDecimal> balanceCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Long>> sharesCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, BigDecimal> priceCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> supplyCache = new ConcurrentHashMap<>();

    // ── 종목별 / 유저별 독립 락 (항상 user → stock 순서로 획득) ─────────────────
    private final ConcurrentHashMap<String, ReentrantLock> userLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ReentrantLock> stockLocks = new ConcurrentHashMap<>();

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    public TradeResponse submitTrade(TradeRequest req) {
        String userId = req.getUserId();
        String channelId = req.getStreamerId();

        ReentrantLock userLock = userLocks.computeIfAbsent(userId, k -> new ReentrantLock());
        ReentrantLock stockLock = stockLocks.computeIfAbsent(channelId, k -> new ReentrantLock());

        userLock.lock();
        try {
            loadPortfolioIfAbsent(userId);
            stockLock.lock();
            try {
                loadStockIfAbsent(channelId, req.getEstimatedPrice());
                boolean isLimit = "limit".equals(req.getOrderMode()) && req.getLimitPrice() != null;
                if (isLimit) {
                    return submitLimitOrder(req);
                } else {
                    return executeMarketOrder(req);
                }
            } finally {
                stockLock.unlock();
            }
        } finally {
            userLock.unlock();
        }
    }

    /**
     * 지정가 주문 취소 — 잔고/보유량 예약을 반환하고 status=cancelled 로 전환
     */
    public void cancelOrder(String orderId, String userId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new IllegalArgumentException("주문을 찾을 수 없습니다."));
        if (!order.getUserId().equals(userId))
            throw new IllegalStateException("본인 주문만 취소할 수 있습니다.");
        if (!"pending".equals(order.getStatus()))
            throw new IllegalStateException("미체결 주문만 취소할 수 있습니다.");

        String channelId = order.getStreamerId();
        boolean isBuy = "buy".equals(order.getType());
        BigDecimal reserved = order.getLimitPrice().multiply(BigDecimal.valueOf(order.getQuantity()))
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal fee = reserved.multiply(TRADE_FEE_RATE).setScale(2, RoundingMode.HALF_UP);

        ReentrantLock userLock = userLocks.computeIfAbsent(userId, k -> new ReentrantLock());
        userLock.lock();
        try {
            new TransactionTemplate(txManager).execute(status -> {
                order.setStatus("cancelled");
                orderRepository.save(order);

                // 예약 반환
                User user = userRepository.findById(userId)
                        .orElse(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build());
                if (isBuy) {
                    // 매수 예약: 잔고 + 총액 + 수수료 반환
                    user.setCoinBalance(user.getCoinBalance().add(reserved).add(fee));
                    userRepository.save(user);
                    balanceCache.put(userId, user.getCoinBalance());
                } else {
                    // 매도 예약: 보유량 반환
                    UserShare share = userShareRepository.findByUserIdAndStockChannelId(userId, channelId)
                            .orElseThrow(() -> new IllegalStateException("보유 주식을 찾을 수 없습니다."));
                    share.setQuantity(share.getQuantity() + order.getQuantity());
                    userShareRepository.save(share);

                    Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
                    shares.merge(channelId, (long) order.getQuantity(), Long::sum);
                }
                return null;
            });
            broadcastOrderBook(channelId);
        } finally {
            userLock.unlock();
        }
    }

    // ---------------------------------------------------------------
    // 실시간 호가창 집계 및 웹소켓 브로드캐스트
    // ---------------------------------------------------------------

    public OrderBookDto getOrderBook(String streamerId) {
        Stock stock = stockRepository.findById(streamerId)
                .orElse(Stock.builder().channelId(streamerId).currentPrice(1000).build());
        BigDecimal currentPrice = BigDecimal.valueOf(stock.getCurrentPrice());

        List<Order> dbOrders = orderRepository.findByStreamerIdAndStatusOrderByCreatedAtAsc(streamerId, "pending");

        Map<BigDecimal, Long> asksAgg = new TreeMap<>(); // 오름차순
        Map<BigDecimal, Long> bidsAgg = new TreeMap<>(Collections.reverseOrder()); // 내림차순

        for (Order o : dbOrders) {
            if ("sell".equals(o.getType())) {
                asksAgg.merge(o.getLimitPrice(), (long) o.getQuantity(), Long::sum);
            } else {
                bidsAgg.merge(o.getLimitPrice(), (long) o.getQuantity(), Long::sum);
            }
        }

        List<OrderBookDto.OrderBookEntry> asks = asksAgg.entrySet().stream()
                .map(e -> new OrderBookDto.OrderBookEntry(e.getKey(), e.getValue()))
                .collect(Collectors.toList());

        List<OrderBookDto.OrderBookEntry> bids = bidsAgg.entrySet().stream()
                .map(e -> new OrderBookDto.OrderBookEntry(e.getKey(), e.getValue()))
                .collect(Collectors.toList());

        return new OrderBookDto(streamerId, currentPrice, asks, bids);
    }

    public void broadcastOrderBook(String streamerId) {
        try {
            OrderBookDto orderBook = getOrderBook(streamerId);
            messagingTemplate.convertAndSend("/topic/orderbook/" + streamerId, orderBook);
        } catch (Exception e) {
            log.error("Failed to broadcast order book for " + streamerId, e);
        }
    }

    public void evictUserCache(String userId) {
        balanceCache.remove(userId);
        sharesCache.remove(userId);
    }

    public void evictSupplyCache(String channelId) {
        supplyCache.remove(channelId);
    }

    /**
     * 종목 상장 직후 호출 — 하우스 계정이 초기 물량(100,000주)을 상장가에 매도 호가로 등록
     */
    public void initializeStockSupply(String channelId, int listingPrice) {
        new TransactionTemplate(txManager).execute(status -> {
            Stock stock = stockRepository.findById(channelId).orElseThrow();

            // 총 발행량을 상장 시점에 고정 (이후 불변)
            stock.setTotalSupply(INITIAL_SUPPLY);
            stockRepository.save(stock);
            supplyCache.put(channelId, INITIAL_SUPPLY);

            User house = userRepository.findById(HOUSE_USER_ID)
                    .orElseGet(() -> userRepository.save(
                            User.builder().id(HOUSE_USER_ID).coinBalance(BigDecimal.ZERO).build()));

            // 하우스 보유량 0 — 전량 매도 호가로 예약
            UserShare houseShare = userShareRepository.findByUserIdAndStockChannelId(HOUSE_USER_ID, channelId)
                    .orElseGet(() -> UserShare.builder().user(house).stock(stock)
                            .quantity(0L).avgPrice(BigDecimal.valueOf(listingPrice)).build());
            houseShare.setQuantity(0L);
            userShareRepository.save(houseShare);

            // 1,000주 × 10개 트랜치, 상장가 기준 5%씩 상승
            long trancheSize = INITIAL_SUPPLY / TRANCHE_COUNT;
            long baseTime = System.currentTimeMillis();
            for (int i = 0; i < TRANCHE_COUNT; i++) {
                int tranchePrice = Math.max(1, (int) Math.round(listingPrice * (1.0 + 0.05 * i) / 10.0) * 10);
                orderRepository.save(Order.builder()
                        .id(UUID.randomUUID().toString())
                        .userId(HOUSE_USER_ID)
                        .streamerId(channelId)
                        .type("sell")
                        .quantity((int) trancheSize)
                        .estimatedPrice(BigDecimal.valueOf(listingPrice))
                        .limitPrice(BigDecimal.valueOf(tranchePrice))
                        .orderMode("limit")
                        .status("pending")
                        .createdAt(baseTime + i)
                        .build());
            }

            return null;
        });

        broadcastOrderBook(channelId);
    }

    // ---------------------------------------------------------------
    // 1. 지정가 주문 제출 (Limit Order Match)
    // ---------------------------------------------------------------

    private TradeResponse submitLimitOrder(TradeRequest req) {
        String userId = req.getUserId();
        String channelId = req.getStreamerId();
        boolean isBuy = "buy".equals(req.getType());
        int totalQty = req.getQuantity();
        BigDecimal limitPrice = req.getLimitPrice();

        BigDecimal initialCost = limitPrice.multiply(BigDecimal.valueOf(totalQty)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal initialFee = initialCost.multiply(TRADE_FEE_RATE).setScale(2, RoundingMode.HALF_UP);

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long currentQty = shares.getOrDefault(channelId, 0L);

        // 사전 검증
        if (isBuy && currentBalance.compareTo(initialCost.add(initialFee)) < 0)
            throw new IllegalStateException("잔고 부족");
        if (!isBuy && currentQty < totalQty)
            throw new IllegalStateException("보유 주식 부족");
        if (isBuy) {
            long pendingBuyQty = orderRepository.sumPendingBuyQuantity(userId, channelId);
            long holdingAfter = currentQty + pendingBuyQty + totalQty;
            if (holdingAfter > MAX_HOLDING_PER_STOCK)
                throw new IllegalStateException("1인 최대 보유 한도(" + MAX_HOLDING_PER_STOCK + "주)를 초과합니다. 추가 매수 가능: " + Math.max(0, MAX_HOLDING_PER_STOCK - currentQty - pendingBuyQty) + "주");
        }

        // 즉시 매칭 시도
        int remainingQty = totalQty;
        BigDecimal lastExecutedPrice = limitPrice;
        BigDecimal matchCostAccum = BigDecimal.ZERO;
        BigDecimal matchFeeAccum = BigDecimal.ZERO;

        List<Order> oppositeOrders = isBuy
                ? orderRepository.findByStreamerIdAndStatusOrderByCreatedAtAsc(channelId, "pending")
                    .stream().filter(o -> "sell".equals(o.getType()) && o.getLimitPrice().compareTo(limitPrice) <= 0).toList()
                : orderRepository.findByStreamerIdAndStatusOrderByCreatedAtAsc(channelId, "pending")
                    .stream().filter(o -> "buy".equals(o.getType()) && o.getLimitPrice().compareTo(limitPrice) >= 0).toList();

        // 오름차순(Asks) / 내림차순(Bids) 정렬
        List<Order> sortedOpposite = new ArrayList<>(oppositeOrders);
        if (isBuy) {
            sortedOpposite.sort(Comparator.comparing(Order::getLimitPrice).thenComparing(Order::getCreatedAt));
        } else {
            sortedOpposite.sort((o1, o2) -> o2.getLimitPrice().compareTo(o1.getLimitPrice()));
        }

        for (Order opp : sortedOpposite) {
            if (remainingQty <= 0) break;

            int matchQty = Math.min(remainingQty, opp.getQuantity());
            BigDecimal matchPrice = opp.getLimitPrice();
            BigDecimal matchCost = matchPrice.multiply(BigDecimal.valueOf(matchQty)).setScale(2, RoundingMode.HALF_UP);
            BigDecimal matchFee = matchCost.multiply(TRADE_FEE_RATE).setScale(2, RoundingMode.HALF_UP);

            executeMatch(opp, userId, matchQty, matchPrice, matchCost, matchFee, isBuy, "limit");

            remainingQty -= matchQty;
            lastExecutedPrice = matchPrice;
            matchCostAccum = matchCostAccum.add(matchCost);
            matchFeeAccum = matchFeeAccum.add(matchFee);
        }

        BigDecimal finalBalance = balanceCache.get(userId);

        // 남은 잔여 수량은 PENDING으로 저장 및 예약
        String pendingOrderId = UUID.randomUUID().toString();
        if (remainingQty > 0) {
            int left = remainingQty;
            BigDecimal reservedCost = limitPrice.multiply(BigDecimal.valueOf(left)).setScale(2, RoundingMode.HALF_UP);
            BigDecimal reservedFee = reservedCost.multiply(TRADE_FEE_RATE).setScale(2, RoundingMode.HALF_UP);

            new TransactionTemplate(txManager).execute(status -> {
                User user = userRepository.findById(userId)
                        .orElse(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build());

                if (isBuy) {
                    // 매수 예약: 잔여 금액 차감
                    user.setCoinBalance(user.getCoinBalance().subtract(reservedCost).subtract(reservedFee));
                    userRepository.save(user);
                    balanceCache.put(userId, user.getCoinBalance());
                } else {
                    // 매도 예약: 이미 match로 보유량 깎인 상태에서 잔여 물량 보유량 감소
                    UserShare share = userShareRepository.findByUserIdAndStockChannelId(userId, channelId)
                            .orElseThrow(() -> new IllegalStateException("보유 주식을 찾을 수 없습니다."));
                    share.setQuantity(share.getQuantity() - left);
                    userShareRepository.save(share);
                    shares.put(channelId, share.getQuantity());
                }

                orderRepository.save(Order.builder()
                        .id(pendingOrderId)
                        .userId(userId)
                        .streamerId(channelId)
                        .type(isBuy ? "buy" : "sell")
                        .quantity(left)
                        .estimatedPrice(req.getEstimatedPrice())
                        .limitPrice(limitPrice)
                        .orderMode("limit")
                        .status("pending")
                        .createdAt(System.currentTimeMillis())
                        .build());
                return null;
            });

            finalBalance = balanceCache.get(userId);

            messagingTemplate.convertAndSend("/topic/orders/" + userId,
                    Map.of("event", "pending", "orderId", pendingOrderId,
                            "streamerId", channelId, "type", isBuy ? "buy" : "sell",
                            "quantity", left, "limitPrice", limitPrice));
        }

        // 종목 가격 정보 업데이트 및 STOMP 알림
        BigDecimal finalPrice = lastExecutedPrice;
        stockRepository.findById(channelId).ifPresent(s -> {
            s.setCurrentPrice(finalPrice.intValue());
            stockRepository.save(s);
            priceCache.put(channelId, finalPrice);
        });

        candleService.onTrade(channelId, finalPrice, System.currentTimeMillis());
        messagingTemplate.convertAndSend("/topic/prices/" + channelId, Map.of("streamerId", channelId, "price", finalPrice));
        broadcastOrderBook(channelId);

        return new TradeResponse(
                remainingQty > 0 ? "pending" : "executed",
                finalPrice,
                finalBalance,
                matchFeeAccum,
                pendingOrderId,
                "limit"
        );
    }

    // ---------------------------------------------------------------
    // 2. 시장가 주문 체결 (Market Order Match + 미체결분 지정가 전환)
    // ---------------------------------------------------------------

    private TradeResponse executeMarketOrder(TradeRequest req) {
        String userId = req.getUserId();
        String channelId = req.getStreamerId();
        boolean isBuy = "buy".equals(req.getType());
        int totalQty = req.getQuantity();

        BigDecimal currentBalance = balanceCache.getOrDefault(userId, INITIAL_BALANCE);
        Map<String, Long> shares = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        long currentQty = shares.getOrDefault(channelId, 0L);

        if (!isBuy && currentQty < totalQty)
            throw new IllegalStateException("보유 주식 부족");
        if (isBuy) {
            long pendingBuyQty = orderRepository.sumPendingBuyQuantity(userId, channelId);
            long holdingAfter = currentQty + pendingBuyQty + totalQty;
            if (holdingAfter > MAX_HOLDING_PER_STOCK)
                throw new IllegalStateException("1인 최대 보유 한도(" + MAX_HOLDING_PER_STOCK + "주)를 초과합니다. 추가 매수 가능: " + Math.max(0, MAX_HOLDING_PER_STOCK - currentQty - pendingBuyQty) + "주");
        }

        int remainingQty = totalQty;
        BigDecimal lastExecutedPrice = priceCache.getOrDefault(channelId, req.getEstimatedPrice());
        BigDecimal totalMatchFee = BigDecimal.ZERO;

        // 호가창의 반대편 대기 주문과 즉시 매칭 (IOC — 매칭 안 되면 오류)
        String oppType = isBuy ? "sell" : "buy";
        List<Order> oppositeOrders = orderRepository
                .findByStreamerIdAndStatusOrderByCreatedAtAsc(channelId, "pending")
                .stream().filter(o -> oppType.equals(o.getType())).toList();

        List<Order> sortedOpposite = new ArrayList<>(oppositeOrders);
        if (isBuy) {
            sortedOpposite.sort(Comparator.comparing(Order::getLimitPrice).thenComparing(Order::getCreatedAt));
        } else {
            sortedOpposite.sort((o1, o2) -> o2.getLimitPrice().compareTo(o1.getLimitPrice()));
        }

        for (Order opp : sortedOpposite) {
            if (remainingQty <= 0) break;

            int matchQty = Math.min(remainingQty, opp.getQuantity());
            BigDecimal matchPrice = opp.getLimitPrice();
            BigDecimal matchCost = matchPrice.multiply(BigDecimal.valueOf(matchQty)).setScale(2, RoundingMode.HALF_UP);
            BigDecimal matchFee = matchCost.multiply(TRADE_FEE_RATE).setScale(2, RoundingMode.HALF_UP);

            if (isBuy) {
                BigDecimal userBal = balanceCache.get(userId);
                if (userBal.compareTo(matchCost.add(matchFee)) < 0) {
                    int maxAffordable = userBal.divide(matchPrice.multiply(BigDecimal.valueOf(1.01)), 0, RoundingMode.DOWN).intValue();
                    if (maxAffordable <= 0) break;
                    matchQty = Math.min(matchQty, maxAffordable);
                    matchCost = matchPrice.multiply(BigDecimal.valueOf(matchQty)).setScale(2, RoundingMode.HALF_UP);
                    matchFee = matchCost.multiply(TRADE_FEE_RATE).setScale(2, RoundingMode.HALF_UP);
                }
            }

            executeMatch(opp, userId, matchQty, matchPrice, matchCost, matchFee, isBuy, "market");

            remainingQty -= matchQty;
            lastExecutedPrice = matchPrice;
            totalMatchFee = totalMatchFee.add(matchFee);
        }

        // 한 주도 체결되지 않았으면 오류
        if (remainingQty == totalQty) {
            throw new IllegalStateException(isBuy ? "매수 가능한 매도 호가가 없습니다." : "매도 가능한 매수 호가가 없습니다.");
        }

        BigDecimal finalBalance = balanceCache.get(userId);

        // 종목 가격 정보 업데이트 및 STOMP 알림
        BigDecimal finalPrice = lastExecutedPrice;
        stockRepository.findById(channelId).ifPresent(s -> {
            s.setCurrentPrice(finalPrice.intValue());
            stockRepository.save(s);
            priceCache.put(channelId, finalPrice);
        });

        candleService.onTrade(channelId, finalPrice, System.currentTimeMillis());
        messagingTemplate.convertAndSend("/topic/prices/" + channelId, Map.of("streamerId", channelId, "price", finalPrice));
        broadcastOrderBook(channelId);

        return new TradeResponse(
                "executed",
                finalPrice,
                finalBalance,
                totalMatchFee,
                UUID.randomUUID().toString(),
                "market"
        );
    }

    // ---------------------------------------------------------------
    // 3. 두 주문의 매칭 매커니즘 실행 (DB 트랜잭션 처리)
    // ---------------------------------------------------------------

    private void executeMatch(Order opposite, String userId, int qty, BigDecimal price, BigDecimal cost, BigDecimal fee, boolean isBuy, String orderMode) {
        String oppositeUserId = opposite.getUserId();
        String channelId = opposite.getStreamerId();

        new TransactionTemplate(txManager).execute(status -> {
            // 1. 상대방 주문 수량 삭감 / 완료 처리
            opposite.setQuantity(opposite.getQuantity() - qty);
            if (opposite.getQuantity() == 0) {
                opposite.setStatus("completed");
                opposite.setExecutedPrice(price);
            }
            orderRepository.save(opposite);

            // 2. 계좌 잔고 정보 업데이트
            User buyerUser = userRepository.findById(isBuy ? userId : oppositeUserId)
                    .orElseThrow(() -> new IllegalStateException("구매 유저 정보가 존재하지 않습니다."));
            User sellerUser = userRepository.findById(isBuy ? oppositeUserId : userId)
                    .orElseThrow(() -> new IllegalStateException("판매 유저 정보가 존재하지 않습니다."));

            if (isBuy) {
                // 내가 Market Buy일 때: 내 캐시 잔고 깎음 (상대 sell은 stock이 이미 예약 상태)
                buyerUser.setCoinBalance(buyerUser.getCoinBalance().subtract(cost).subtract(fee));
                userRepository.save(buyerUser);
                balanceCache.put(userId, buyerUser.getCoinBalance());

                // 상대방 Sell Limit 체결: 판매 대금 (수수료 차감) 지급
                sellerUser.setCoinBalance(sellerUser.getCoinBalance().add(cost.subtract(fee)));
                userRepository.save(sellerUser);
                balanceCache.put(oppositeUserId, sellerUser.getCoinBalance());
            } else {
                // 내가 Market Sell일 때: 내 보유 주식 깎고 판매 대금 지급
                sellerUser.setCoinBalance(sellerUser.getCoinBalance().add(cost.subtract(fee)));
                userRepository.save(sellerUser);
                balanceCache.put(userId, sellerUser.getCoinBalance());

                // 상대방 Buy Limit 체결: 구매 수수료는 이미 예약 시 선반영 됨.
            }

            // 3. 주식 보유 현황(UserShare) 갱신
            // 매수인 주식 보유량 증가
            Stock stock = stockRepository.findById(channelId).orElseThrow();
            UserShare buyerShare = userShareRepository.findByUserIdAndStockChannelId(buyerUser.getId(), channelId)
                    .orElseGet(() -> UserShare.builder().user(buyerUser).stock(stock).avgPrice(BigDecimal.ZERO).build());

            long prevBuyerQty = buyerShare.getQuantity();
            long newBuyerQty = prevBuyerQty + qty;
            BigDecimal prevBuyerAvg = buyerShare.getAvgPrice() != null ? buyerShare.getAvgPrice() : BigDecimal.ZERO;
            BigDecimal prevTotalCost = prevBuyerAvg.multiply(BigDecimal.valueOf(prevBuyerQty));
            buyerShare.setAvgPrice(prevTotalCost.add(cost).divide(BigDecimal.valueOf(newBuyerQty), 2, RoundingMode.HALF_UP));
            buyerShare.setQuantity(newBuyerQty);
            userShareRepository.save(buyerShare);

            Map<String, Long> buyerSharesMap = sharesCache.computeIfAbsent(buyerUser.getId(), k -> new ConcurrentHashMap<>());
            buyerSharesMap.put(channelId, newBuyerQty);

            // 매도인의 주식은 예약되어 있었거나 (Limit Sell), Market Sell 이므로 차감
            if (!isBuy) {
                UserShare sellerShare = userShareRepository.findByUserIdAndStockChannelId(userId, channelId)
                        .orElseThrow(() -> new IllegalStateException("판매 주식이 없습니다."));
                sellerShare.setQuantity(sellerShare.getQuantity() - qty);
                if (sellerShare.getQuantity() == 0) {
                    userShareRepository.delete(sellerShare);
                } else {
                    userShareRepository.save(sellerShare);
                }
                Map<String, Long> sellerSharesMap = sharesCache.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
                sellerSharesMap.put(channelId, sellerShare.getQuantity());
            }

            // 4. 주문 이력 완료 내역 기록 생성
            // 본 주문 체결분 저장
            orderRepository.save(Order.builder()
                    .id(UUID.randomUUID().toString())
                    .userId(userId)
                    .streamerId(channelId)
                    .type(isBuy ? "buy" : "sell")
                    .quantity(qty)
                    .estimatedPrice(price)
                    .executedPrice(price)
                    .orderMode(orderMode)
                    .status("completed")
                    .createdAt(System.currentTimeMillis())
                    .build());

            // 상대방 limit 주문 체결분 저장
            orderRepository.save(Order.builder()
                    .id(UUID.randomUUID().toString())
                    .userId(oppositeUserId)
                    .streamerId(channelId)
                    .type(isBuy ? "sell" : "buy")
                    .quantity(qty)
                    .estimatedPrice(price)
                    .executedPrice(price)
                    .orderMode("limit")
                    .status("completed")
                    .createdAt(System.currentTimeMillis())
                    .build());

            // 5. 종목 정보 갱신 — totalSupply는 상장 시 고정, 거래로 변하지 않음
            stock.setDailyVolume(stock.getDailyVolume() + qty);
            stockRepository.save(stock);

            return null;
        });

        // 상대방에게 매칭 체결 알림 발송 (웹소켓)
        messagingTemplate.convertAndSend("/topic/orders/" + oppositeUserId, Map.of(
                "event", "filled",
                "orderId", opposite.getId(),
                "streamerId", channelId,
                "executedPrice", price,
                "fee", fee
        ));

        // 전체 트레이드 채널 알림
        messagingTemplate.convertAndSend("/topic/trades", Map.of(
                "streamerId", channelId,
                "streamerName", stockRepository.findById(channelId).map(Stock::getStreamerName).orElse(channelId),
                "type", isBuy ? "buy" : "sell",
                "quantity", qty,
                "price", price,
                "fee", fee,
                "timestamp", System.currentTimeMillis()
        ));
    }

    // ---------------------------------------------------------------
    // 캐시 로딩 (포트폴리오 조회 시)
    // ---------------------------------------------------------------

    private void loadPortfolioIfAbsent(String userId) {
        if (balanceCache.containsKey(userId)) return;
        User user = userRepository.findById(userId)
                .orElse(User.builder().id(userId).coinBalance(INITIAL_BALANCE).build());
        balanceCache.put(userId, user.getCoinBalance());
        Map<String, Long> shares = new ConcurrentHashMap<>();
        userShareRepository.findByUserId(userId)
                .forEach(s -> shares.put(s.getStock().getChannelId(), s.getQuantity()));
        sharesCache.put(userId, shares);
    }

    private void loadStockIfAbsent(String channelId, BigDecimal fallback) {
        if (priceCache.containsKey(channelId)) return;
        stockRepository.findById(channelId).ifPresentOrElse(
            s -> {
                priceCache.put(channelId, BigDecimal.valueOf(s.getCurrentPrice()));
                supplyCache.put(channelId, s.getTotalSupply());
            },
            () -> {
                priceCache.put(channelId, fallback);
                supplyCache.put(channelId, 0L);
            }
        );
    }
}
