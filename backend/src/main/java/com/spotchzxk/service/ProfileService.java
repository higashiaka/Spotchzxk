package com.spotchzxk.service;

import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private static final BigDecimal NICKNAME_CHANGE_PRICE = new BigDecimal("30000000");

    private final UserRepository userRepository;
    private final TradeEngine tradeEngine;

    @Transactional
    public void changeNickname(String uid, String displayName) {
        String trimmed = displayName == null ? "" : displayName.trim();
        if (trimmed.isBlank()) {
            throw new IllegalArgumentException("닉네임을 입력해 주세요.");
        }
        if (trimmed.length() > 20) {
            throw new IllegalArgumentException("닉네임은 최대 20자까지 가능합니다.");
        }

        var user = userRepository.findById(uid)
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
        if (user.getCoinBalance().compareTo(NICKNAME_CHANGE_PRICE) < 0) {
            throw new IllegalStateException("잔액이 부족합니다. 닉네임 변경에는 30,000,000코인이 필요합니다.");
        }

        user.setDisplayName(trimmed);
        user.setCoinBalance(user.getCoinBalance().subtract(NICKNAME_CHANGE_PRICE));
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
