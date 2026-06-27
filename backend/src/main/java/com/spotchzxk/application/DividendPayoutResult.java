package com.spotchzxk.application;

public record DividendPayoutResult(boolean countAsProcessed, Reason reason) {

    public enum Reason {
        PAID,
        NO_ELIGIBLE_SHARES,
        EMPTY_FEE_POOL,
        ZERO_TOTAL_PAYOUT,
        NO_USERS_UPDATED
    }

    public static DividendPayoutResult paid() {
        return new DividendPayoutResult(true, Reason.PAID);
    }

    public static DividendPayoutResult skipped(Reason reason) {
        return new DividendPayoutResult(true, reason);
    }

    public static DividendPayoutResult failed(Reason reason) {
        return new DividendPayoutResult(false, reason);
    }
}
