package com.spotchzxk.exception;

public class InsufficientFollowerCountException extends RuntimeException {
    public InsufficientFollowerCountException(String channelId, int followerCount) {
        super("팔로워 100명 미만 채널은 상장할 수 없습니다: " + channelId + " (현재 " + followerCount + "명)");
    }
}
