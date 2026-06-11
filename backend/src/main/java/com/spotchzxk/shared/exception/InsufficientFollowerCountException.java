package com.spotchzxk.shared.exception;

public class InsufficientFollowerCountException extends RuntimeException {
    public InsufficientFollowerCountException(String channelId, int followerCount) {
        super("팔로워 100명 미만의 채널은 등록할 수 없습니다: " + channelId + " (현재 " + followerCount + "명)");
    }
}
