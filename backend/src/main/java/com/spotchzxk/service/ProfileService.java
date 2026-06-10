package com.spotchzxk.service;

import com.spotchzxk.entity.User;
import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private final UserRepository userRepository;
    private final TradeEngine tradeEngine;
    private final TransactionTemplate transactionTemplate;

    public void changeNickname(String uid, String displayName) {
        String trimmed = displayName == null ? "" : displayName.trim();
        if (trimmed.isBlank()) {
            throw new IllegalArgumentException("Display name is required.");
        }
        if (trimmed.length() > 8) {
            throw new IllegalArgumentException("Display name can be at most 8 characters.");
        }
        // Issue #31: 허용 문자 화이트리스트 — 한글·영문·숫자 외 특수문자/이모지 차단
        if (!trimmed.matches("[\\p{IsHangul}a-zA-Z0-9]+")) {
            throw new IllegalArgumentException("Display name can only contain Korean, English letters, and numbers.");
        }

        tradeEngine.runWithUserLock(uid, () -> transactionTemplate.executeWithoutResult(status -> {
            User user = userRepository.findById(uid)
                    .orElseThrow(() -> new IllegalStateException("User not found."));
            if (user.getNicknameChangeTickets() <= 0) {
                throw new IllegalStateException("No nickname-change ticket available.");
            }
            if (userRepository.changeDisplayNameAndUseNicknameTicket(uid, trimmed) != 1) {
                throw new IllegalStateException("No nickname-change ticket available.");
            }
            tradeEngine.evictUserCache(uid);
        }));
    }

    public void updateRankingNicknamePublic(String uid, boolean isPublic) {
        transactionTemplate.executeWithoutResult(status -> {
            if (userRepository.updateRankingNicknamePublic(uid, isPublic) != 1) {
                throw new IllegalStateException("User not found.");
            }
        });
    }
}
