package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.User;

import java.math.BigDecimal;

public final class InitialBalancePolicy {

    public static final BigDecimal GOOGLE_INITIAL_BALANCE = BigDecimal.valueOf(20_000_000);
    public static final BigDecimal NAVER_INITIAL_BALANCE = BigDecimal.valueOf(30_000_000);
    public static final BigDecimal NAVER_LINK_BONUS = BigDecimal.valueOf(10_000_000);

    private InitialBalancePolicy() {
    }

    public static BigDecimal initialBalanceFor(String userId) {
        return isNaverOnlyUid(userId) ? NAVER_INITIAL_BALANCE : GOOGLE_INITIAL_BALANCE;
    }

    public static BigDecimal resetBalanceFor(User user) {
        return user.getNaverUid() != null ? NAVER_INITIAL_BALANCE : initialBalanceFor(user.getId());
    }

    private static boolean isNaverOnlyUid(String userId) {
        return userId != null && userId.startsWith("naver:");
    }
}
