package com.spotchzxk.shared.exception;

public class InsufficientFollowerCountException extends RuntimeException {
    public InsufficientFollowerCountException(String channelId, int followerCount) {
        super("?붾줈??100紐?誘몃쭔 梨꾨꼸? ?곸옣?????놁뒿?덈떎: " + channelId + " (?꾩옱 " + followerCount + "紐?");
    }
}


