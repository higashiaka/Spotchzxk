package com.spotchzxk.application;

import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AdminUserService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public Map<String, Object> suspendUser(String userId, String reason, long durationHours) {
        LocalDateTime suspendedUntil = LocalDateTime.now(KST).plusHours(durationHours);
        if (userRepository.suspendUser(userId, reason, suspendedUntil) != 1) {
            return null;
        }
        sendAfterCommit(() -> messagingTemplate.convertAndSend("/topic/user-suspension/" + userId,
                Map.of("suspended", true, "reason", reason, "suspendedUntil", suspendedUntil.toString())));
        return Map.of(
                "userId", userId,
                "suspended", true,
                "reason", reason,
                "durationHours", durationHours,
                "suspendedUntil", suspendedUntil.toString()
        );
    }

    @Transactional
    public boolean unsuspendUser(String userId) {
        boolean updated = userRepository.clearSuspension(userId) == 1;
        if (updated) {
            sendAfterCommit(() -> messagingTemplate.convertAndSend("/topic/user-suspension/" + userId,
                    Map.of("suspended", false)));
        }
        return updated;
    }

    private void sendAfterCommit(Runnable task) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            task.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                task.run();
            }
        });
    }
}
