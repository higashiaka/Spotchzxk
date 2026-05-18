package com.spotchzxk.service;

import com.spotchzxk.entity.User;
import com.spotchzxk.repository.DeviceMappingRepository;
import com.spotchzxk.repository.OrderRepository;
import com.spotchzxk.repository.UserRepository;
import com.spotchzxk.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AccountLinkService {

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final OrderRepository orderRepository;
    private final DeviceMappingRepository deviceMappingRepository;

    /**
     * 게스트 계정 데이터를 Google 계정으로 이전한다.
     *
     * linkWithPopup이 auth/credential-already-in-use로 실패한 경우에만 호출된다.
     * googleUid는 Firebase 토큰에서 검증된 값이므로 신뢰할 수 있다.
     */
    @Transactional
    public void mergeGuestIntoGoogle(String guestUid, String googleUid) {
        if (guestUid.equals(googleUid)) return;

        User guestUser = userRepository.findById(guestUid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "게스트 계정을 찾을 수 없습니다."));

        // Google 계정이 이미 users 테이블에 있으면 기존 주식/주문 데이터 제거 후 덮어씀
        if (userRepository.existsById(googleUid)) {
            userShareRepository.deleteByUserId(googleUid);
            // orders는 CASCADE DELETE가 없으므로 직접 삭제
            orderRepository.deleteByUserId(googleUid);
        }

        // Google 유저 생성/갱신 (게스트 잔액·리셋 정보 그대로 이전)
        User googleUser = User.builder()
                .id(googleUid)
                .coinBalance(guestUser.getCoinBalance())
                .resetCount(guestUser.getResetCount())
                .lastResetDate(guestUser.getLastResetDate())
                .build();
        userRepository.save(googleUser);

        // FK가 게스트를 바라보는 레코드를 Google 계정으로 일괄 이전
        userShareRepository.updateUserId(guestUid, googleUid);
        orderRepository.updateUserId(guestUid, googleUid);
        deviceMappingRepository.updateUid(guestUid, googleUid);

        // 게스트 유저 삭제 (user_shares, orders ON DELETE CASCADE 적용)
        userRepository.deleteById(guestUid);
    }
}
