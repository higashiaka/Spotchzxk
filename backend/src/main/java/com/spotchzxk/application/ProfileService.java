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
            throw new IllegalArgumentException("?됰꽕?꾩쓣 ?낅젰?댁＜?몄슂.");
        }
        if (trimmed.length() > 8) {
            throw new IllegalArgumentException("?됰꽕?꾩? 理쒕? 8?먭퉴吏 ?낅젰?????덉뒿?덈떎.");
        }
        // Issue #31: ?덉슜 臾몄옄 ?붿씠?몃━?ㅽ듃 ???쒓?쨌?곷Ц쨌?レ옄 ???뱀닔臾몄옄/?대え吏 李⑤떒
        if (!trimmed.matches("[\\p{IsHangul}a-zA-Z0-9]+")) {
            throw new IllegalArgumentException("?됰꽕?꾩? ?쒓?, ?곷Ц, ?レ옄留??ъ슜?????덉뒿?덈떎.");
        }

        tradeEngine.runWithUserLock(uid, () -> transactionTemplate.executeWithoutResult(status -> {
            User user = userRepository.findById(uid)
                    .orElseThrow(() -> new IllegalStateException("?ъ슜???뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??"));
            if (user.getNicknameChangeTickets() <= 0) {
                throw new IllegalStateException("?됰꽕??蹂寃쎄텒???놁뒿?덈떎.");
            }
            if (userRepository.changeDisplayNameAndUseNicknameTicket(uid, trimmed) != 1) {
                throw new IllegalStateException("?됰꽕??蹂寃쎄텒???놁뒿?덈떎.");
            }
            tradeEngine.evictUserCache(uid);
        }));
    }

    public void updateRankingNicknamePublic(String uid, boolean isPublic) {
        transactionTemplate.executeWithoutResult(status -> {
            if (userRepository.updateRankingNicknamePublic(uid, isPublic) != 1) {
                throw new IllegalStateException("?ъ슜???뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??");
            }
        });
    }
}


