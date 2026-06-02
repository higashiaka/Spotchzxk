package com.spotchzxk.policy;

public final class AntiWhalePolicy {

    public static final long MAX_HOLDING = 1_000L;
    public static final long NEW_LISTING_CAP = 200L;
    public static final long NEW_LISTING_HOURS = 24L;
    public static final long DIVIDEND_CAP = 1_000L;

    private AntiWhalePolicy() {
    }
}
