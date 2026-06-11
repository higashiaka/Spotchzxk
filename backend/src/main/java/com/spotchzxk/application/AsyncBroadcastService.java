package com.spotchzxk.application;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AsyncBroadcastService {

    private final SimpMessagingTemplate messagingTemplate;

    @Async("broadcastExecutor")
    public void send(String destination, Object payload) {
        messagingTemplate.convertAndSend(destination, payload);
    }
}
