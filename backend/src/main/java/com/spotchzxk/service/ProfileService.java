package com.spotchzxk.service;

import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private final UserRepository userRepository;
    private final TradeEngine tradeEngine;

    @Transactional
    public void changeNickname(String uid, String displayName) {
        String trimmed = displayName == null ? "" : displayName.trim();
        if (trimmed.isBlank()) {
            throw new IllegalArgumentException("닉네임을 입력해 주세요.");
        }
        if (trimmed.length() > 8) {
            throw new IllegalArgumentException("닉네임은 최대 8자까지 가능합니다.");
        }

        var user = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
        if (user.getNicknameChangeTickets() <= 0) {
            throw new IllegalStateException("닉네임 변경권이 없습니다.");
        }

        user.setDisplayName(trimmed);
        user.setNicknameChangeTickets(user.getNicknameChangeTickets() - 1);
        userRepository.save(user);
        tradeEngine.evictUserCache(uid);
    }

    @Transactional
    public void updateRankingNicknamePublic(String uid, boolean isPublic) {
        var user = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
        user.setRankingNicknamePublic(isPublic);
        userRepository.save(user);
    }
}
