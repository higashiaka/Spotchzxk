package com.spotchzxk.domain.stock.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.DynamicUpdate;
import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.time.LocalDateTime;

@Entity
@Table(name = "stocks")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@DynamicUpdate
public class Stock {
    private static final int PRICE_SCALE = 6;

    @Id
    @Column(length = 50)
    private String channelId;

    @Column(nullable = false, length = 100)
    private String streamerName;

    @Column(columnDefinition = "TEXT")
    private String profileImageUrl;

    @Column
    private long followerCount;

    @Column
    private long baseBroadcastHours;

    @Builder.Default
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigDecimal totalSupply = BigDecimal.ZERO;

    @Builder.Default
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigDecimal dailyVolume = BigDecimal.ZERO;

    @Builder.Default
    @Column(nullable = false, precision = 65, scale = 6, columnDefinition = "DECIMAL(65,6) DEFAULT 0.000000")
    private BigDecimal dailyTradingValue = BigDecimal.ZERO;

    @Builder.Default
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    @Column(nullable = false, precision = 65, scale = 6, columnDefinition = "DECIMAL(65,6) DEFAULT 0.000000")
    private BigDecimal basePrice = BigDecimal.ZERO;

    @Builder.Default
    @Column(nullable = false, precision = 65, scale = 6, columnDefinition = "DECIMAL(65,6) DEFAULT 10000.000000")
    private BigDecimal listingPrice = BigDecimal.valueOf(10_000);

    @Builder.Default
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    @Column(precision = 65, scale = 6, columnDefinition = "DECIMAL(65,6) DEFAULT 0.000000")
    private BigDecimal currentPrice = BigDecimal.ZERO;

    @Column
    @com.fasterxml.jackson.annotation.JsonProperty("isLive")
    private boolean isLive;

    @Column
    private LocalDateTime liveStartedAt;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 0")
    private long dividendAccumulationCount;

    @Builder.Default
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigDecimal issuedShares = BigDecimal.ZERO;

    @Builder.Default
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigDecimal preStreamFloat = BigDecimal.ZERO;

    @Builder.Default
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigInteger coinReserve = BigInteger.ZERO;

    @Builder.Default
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigInteger shareReserve = BigInteger.ZERO;

    @Builder.Default
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    @Column(nullable = false, precision = 65, scale = 0, columnDefinition = "DECIMAL(65,0) DEFAULT 0")
    private BigInteger feePool = BigInteger.ZERO;

    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 1")
    private long liquidityTier;

    @Column(nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean tradingSuspended;

    @Column(name = "trading_suspension_reason", length = 50)
    private String tradingSuspensionReason;

    @Column(updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime listedAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (listedAt == null)  listedAt  = LocalDateTime.now();
        if (listingPrice.compareTo(BigDecimal.ZERO) <= 0) {
            listingPrice = currentPrice.max(BigDecimal.valueOf(10_000));
        }
    }

    public void applyTrade(BigDecimal executedPrice, boolean isBuy, long qty, BigDecimal tradingValue) {
        applyTrade(executedPrice, isBuy, BigInteger.valueOf(qty), tradingValue);
    }

    public void applyTrade(BigDecimal executedPrice, boolean isBuy, BigInteger qty, BigDecimal tradingValue) {
        BigDecimal qtyDecimal = new BigDecimal(qty);
        this.currentPrice = executedPrice;
        this.dailyVolume = this.dailyVolume.add(qtyDecimal);
        this.dailyTradingValue = this.dailyTradingValue.add(tradingValue.abs());
        if (isBuy) {
            this.issuedShares = this.issuedShares.add(qtyDecimal);
        } else {
            this.issuedShares = this.issuedShares.subtract(qtyDecimal).max(BigDecimal.ZERO);
        }
    }

    public void applyDailyReset() {
        this.basePrice = this.currentPrice;
        this.dailyVolume = BigDecimal.ZERO;
        this.dailyTradingValue = BigDecimal.ZERO;
    }

    public void startLive(LocalDateTime startedAt) {
        this.isLive = true;
        this.liveStartedAt = startedAt;
        this.dividendAccumulationCount = 0;
    }

    public void endLive() {
        this.isLive = false;
        this.liveStartedAt = null;
        this.dividendAccumulationCount = 0;
    }

    public void updateDividendAccumulation(long count) {
        this.dividendAccumulationCount = count;
    }

    public void updatePreStreamFloat(BigDecimal preStreamFloat) {
        this.preStreamFloat = preStreamFloat;
    }

    public void updateStreamerName(String streamerName) {
        this.streamerName = streamerName;
    }

    public void updateProfileImageUrl(String profileImageUrl) {
        this.profileImageUrl = profileImageUrl;
    }

    public void updateFollowerCount(long followerCount) {
        this.followerCount = followerCount;
    }

    public void finalizeListing(long listingPrice, long totalSupply) {
        this.currentPrice = BigDecimal.valueOf(listingPrice);
        this.basePrice = BigDecimal.valueOf(listingPrice);
        this.listingPrice = BigDecimal.valueOf(listingPrice);
        this.totalSupply = BigDecimal.valueOf(totalSupply);
        this.issuedShares = BigDecimal.ZERO;
    }

    public void initAmmPool(BigInteger coinReserve, BigInteger shareReserve, long liquidityTier) {
        this.coinReserve = coinReserve;
        this.shareReserve = shareReserve;
        this.liquidityTier = liquidityTier;
        this.currentPrice = new BigDecimal(coinReserve)
                .divide(new BigDecimal(shareReserve), PRICE_SCALE, RoundingMode.HALF_UP);
    }

    public void initAmmPool(long coinReserve, long shareReserve, long liquidityTier) {
        initAmmPool(BigInteger.valueOf(coinReserve), BigInteger.valueOf(shareReserve), liquidityTier);
    }

    public void syncIssuedShares(BigDecimal totalHeld) {
        this.issuedShares = totalHeld.max(BigDecimal.ZERO);
    }

    public void removeFractionalIssuedShares(BigDecimal quantity) {
        this.issuedShares = nonNull(this.issuedShares).subtract(quantity).max(BigDecimal.ZERO);
    }

    public void applyAmmTrade(BigInteger newCoinReserve, BigInteger newShareReserve, BigInteger fee) {
        BigDecimal computed = new BigDecimal(newCoinReserve)
                .divide(new BigDecimal(newShareReserve), PRICE_SCALE, RoundingMode.HALF_UP);
        // Price must never round to zero while reserves are positive
        this.currentPrice = computed.compareTo(BigDecimal.ZERO) == 0 && newCoinReserve.signum() > 0
                ? new BigDecimal("0.000001")
                : computed;
        this.coinReserve = newCoinReserve;
        this.shareReserve = newShareReserve;
        this.feePool = nonNull(this.feePool).add(fee);
    }

    public void addBalancedLiquidity(BigInteger coinAmount, BigInteger shareAmount, BigInteger feeAmount) {
        if (coinAmount.signum() <= 0 || shareAmount.signum() <= 0) {
            return;
        }
        this.coinReserve = nonNull(this.coinReserve).add(coinAmount);
        this.shareReserve = nonNull(this.shareReserve).add(shareAmount);
        this.feePool = nonNull(this.feePool).add(feeAmount.max(BigInteger.ZERO));
        this.totalSupply = nonNull(this.totalSupply).add(new BigDecimal(shareAmount));
        this.currentPrice = new BigDecimal(this.coinReserve)
                .divide(new BigDecimal(this.shareReserve), PRICE_SCALE, RoundingMode.HALF_UP);
    }

    public void suspendTrading() {
        suspendTrading("UNKNOWN");
    }

    public void suspendTrading(String reason) {
        this.tradingSuspended = true;
        this.tradingSuspensionReason = reason;
    }

    public void resumeTrading() {
        this.tradingSuspended = false;
        this.tradingSuspensionReason = null;
    }

    public void drainFeePool(BigInteger amount) {
        this.feePool = nonNull(this.feePool).subtract(amount).max(BigInteger.ZERO);
    }

    public void applyStockSplit(int ratio) {
        if (ratio <= 1) {
            throw new IllegalArgumentException("Split ratio must be greater than 1.");
        }
        BigDecimal ratioDecimal = BigDecimal.valueOf(ratio);
        this.currentPrice = this.currentPrice.divide(ratioDecimal, PRICE_SCALE, RoundingMode.HALF_UP);
        this.basePrice = this.basePrice.divide(ratioDecimal, PRICE_SCALE, RoundingMode.HALF_UP);
        this.listingPrice = this.listingPrice.divide(ratioDecimal, PRICE_SCALE, RoundingMode.HALF_UP);
        this.totalSupply = this.totalSupply.multiply(ratioDecimal);
        this.dailyVolume = this.dailyVolume.multiply(ratioDecimal);
        this.issuedShares = this.issuedShares.multiply(ratioDecimal);
        this.preStreamFloat = this.preStreamFloat.multiply(ratioDecimal);
        // AMM: more shares at lower price — coinReserve unchanged so price halves naturally
        this.shareReserve = nonNull(this.shareReserve).multiply(BigInteger.valueOf(ratio));
    }

    public void applyReverseStockSplit(int ratio) {
        if (ratio <= 1) {
            throw new IllegalArgumentException("Reverse split ratio must be greater than 1.");
        }
        BigDecimal ratioDecimal = BigDecimal.valueOf(ratio);
        this.currentPrice = this.currentPrice.multiply(ratioDecimal);
        this.basePrice = this.basePrice.multiply(ratioDecimal);
        this.listingPrice = this.listingPrice.multiply(ratioDecimal);
        this.totalSupply = this.totalSupply.divide(ratioDecimal, 2, RoundingMode.HALF_UP);
        this.dailyVolume = this.dailyVolume.divide(ratioDecimal, 2, RoundingMode.HALF_UP);
        this.issuedShares = this.issuedShares.divide(ratioDecimal, 2, RoundingMode.HALF_UP);
        this.preStreamFloat = this.preStreamFloat.divide(ratioDecimal, 2, RoundingMode.HALF_UP);
        this.shareReserve = nonNull(this.shareReserve)
                .divide(BigInteger.valueOf(ratio))
                .max(BigInteger.ONE);
        if (nonNull(this.coinReserve).signum() > 0 && this.shareReserve.signum() > 0) {
            BigDecimal computed = new BigDecimal(this.coinReserve)
                    .divide(new BigDecimal(this.shareReserve), PRICE_SCALE, RoundingMode.HALF_UP);
            this.currentPrice = computed.compareTo(BigDecimal.ZERO) == 0
                    ? new BigDecimal("0.000001")
                    : computed;
        }
    }

    private BigInteger nonNull(BigInteger value) {
        return value != null ? value : BigInteger.ZERO;
    }

    private BigDecimal nonNull(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }
}
