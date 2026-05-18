package com.spotchzxk.exception;

public class ChannelNotFoundException extends RuntimeException {
    public ChannelNotFoundException(String channelId) {
        super("존재하지 않는 Chzzk 채널입니다: " + channelId);
    }
}
