package com.spotchzxk.domain.user.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "users")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class User {

    @Id
    @Column(length = 128)
    private String id;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal coinBalance;

    @Column(name = "display_name", length = 20)
    private String displayName;

    @Column(name = "realized_profit", nullable = false, precision = 20, scale = 2)
    @Builder.Default
    private BigDecimal realizedProfit = BigDecimal.ZERO;

    @Column(name = "ranking_nickname_public", nullable = false)
    @Builder.Default
    private boolean rankingNicknamePublic = false;

    @Column(name = "nickname_change_tickets", nullable = false)
    @Builder.Default
    private int nicknameChangeTickets = 0;

    @Column(name = "stock_add_tickets", nullable = false)
    @Builder.Default
    private int stockAddTickets = 0;

    @Column(nullable = false)
    @Builder.Default
    private int resetCount = 0;

    @Column(nullable = true)
    private LocalDate lastResetDate;

    @Column(nullable = false, precision = 20, scale = 2)
    @Builder.Default
    private BigDecimal dividendTotal = BigDecimal.ZERO;

    @Column(name = "donation_total", nullable = false, precision = 20, scale = 2)
    @Builder.Default
    private BigDecimal donationTotal = BigDecimal.ZERO;

    @Column(nullable = false)
    @Builder.Default
    private boolean isBot = false;

    @Column(name = "is_guest", nullable = false)
    @Builder.Default
    private boolean isGuest = false;

    public void updateBalance(BigDecimal newBalance) {
        this.coinBalance = newBalance;
    }

    public void deductBalance(BigDecimal amount) {
        this.coinBalance = this.coinBalance.subtract(amount);
    }

    public void updateRealizedProfit(BigDecimal newProfit) {
        this.realizedProfit = newProfit;
    }

    public void resetFinancials(BigDecimal initialBalance) {
        this.coinBalance = initialBalance;
        this.realizedProfit = BigDecimal.ZERO;
    }

    public void applyDailyResetTracking(LocalDate today) {
        if (!today.equals(this.lastResetDate)) {
            this.resetCount = 0;
            this.lastResetDate = today;
        }
    }

    public void incrementResetCount() {
        this.resetCount++;
    }

    public void changeDisplayName(String name) {
        this.displayName = name;
    }

    public void useNicknameTicket() {
        this.nicknameChangeTickets--;
    }

    public void addNicknameTicket() {
        this.nicknameChangeTickets++;
    }

    public void addStockAddTicket() {
        this.stockAddTickets++;
    }

    public void useStockAddTicket() {
        this.stockAddTickets--;
    }

    public void updateRankingVisibility(boolean isPublic) {
        this.rankingNicknamePublic = isPublic;
    }

    public void markAsGuest() {
        this.isGuest = true;
    }

    public void markAsRegistered() {
        this.isGuest = false;
    }

    public void markAsBot() {
        this.isBot = true;
    }

    // Issue #33: DonationController calls userRepository directly; this method is kept for tests only
    public void addDonation(BigDecimal amount) {
        this.coinBalance = this.coinBalance.subtract(amount);
        this.donationTotal = this.donationTotal.add(amount);
    }
}


