package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
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
            throw new IllegalArgumentException("닉네임을 입력해주세요.");
        }
        if (trimmed.length() > 8) {
            throw new IllegalArgumentException("닉네임은 최대 8자까지 입력할 수 있습니다.");
        }
        // Issue #31: 허용 문자 화이트리스트 기반 검증으로 특수문자/이모지 차단
        if (!trimmed.matches("[\\p{IsHangul}a-zA-Z0-9]+")) {
            throw new IllegalArgumentException("닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.");
        }

        tradeEngine.runWithUserLock(uid, () -> transactionTemplate.executeWithoutResult(status -> {
            User user = userRepository.findById(uid)
                    .orElseThrow(() -> new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));
            if (user.getNicknameChangeTickets() <= 0) {
                throw new IllegalStateException("닉네임 변경권이 없습니다.");
            }
            if (userRepository.changeDisplayNameAndUseNicknameTicket(uid, trimmed) != 1) {
                throw new IllegalStateException("닉네임 변경권이 없습니다.");
            }
            tradeEngine.evictUserCache(uid);
        }));
    }

    public void updateRankingNicknamePublic(String uid, boolean isPublic) {
        transactionTemplate.executeWithoutResult(status -> {
            if (userRepository.updateRankingNicknamePublic(uid, isPublic) != 1) {
                throw new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
            }
        });
    }

    public void updateProfileImageUrl(String uid, String profileImageUrl) {
        String trimmed = profileImageUrl == null ? "" : profileImageUrl.trim();
        if (trimmed.length() > 500) {
            throw new IllegalArgumentException("프로필 이미지 URL이 너무 깁니다.");
        }
        transactionTemplate.executeWithoutResult(status -> {
            if (userRepository.updateProfileImageUrl(uid, trimmed.isBlank() ? null : trimmed) != 1) {
                throw new IllegalStateException("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
            }
        });
    }
}
