package com.spotchzxk.application;

import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class OnlineUserService {

    private final SimpMessagingTemplate messagingTemplate;
    private final Set<String> sessionIds = ConcurrentHashMap.newKeySet();

    public int getOnlineCount() {
        return sessionIds.size();
    }

    @EventListener
    public void handleSessionConnect(SessionConnectEvent event) {
        if (event.getMessage().getHeaders().get("simpSessionId") instanceof String sessionId) {
            sessionIds.add(sessionId);
            broadcastCount();
        }
    }

    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        sessionIds.remove(event.getSessionId());
        broadcastCount();
    }

    private void broadcastCount() {
        messagingTemplate.convertAndSend("/topic/online-count", Map.of("count", getOnlineCount()));
    }
}


