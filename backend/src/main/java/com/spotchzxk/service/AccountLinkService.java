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
    private final TradeEngine tradeEngine;

    /**
     * Migrates guest account data into the Google account.
     *
     * Called only when linkWithPopup fails with auth/credential-already-in-use.
     * googleUid is a value verified from the Firebase token and can be trusted.
     */
    @Transactional
    public void mergeGuestIntoGoogle(String guestUid, String googleUid) {
        if (guestUid.equals(googleUid)) return;

        User guestUser = userRepository.findById(guestUid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "게스트 계정을 찾을 수 없습니다."));

        // If the Google account already exists in the users table, remove its existing shares/orders before overwriting
        if (userRepository.existsById(googleUid)) {
            userShareRepository.deleteByUserId(googleUid);
            // orders has no CASCADE DELETE, so delete explicitly
            orderRepository.deleteByUserId(googleUid);
        }

        // Create/update Google user (transfer guest balance and reset info as-is)
        User googleUser = User.builder()
                .id(googleUid)
                .coinBalance(guestUser.getCoinBalance())
                .displayName(guestUser.getDisplayName())
                .realizedProfit(guestUser.getRealizedProfit())
                .rankingNicknamePublic(guestUser.isRankingNicknamePublic())
                .nicknameChangeTickets(guestUser.getNicknameChangeTickets())
                .stockAddTickets(guestUser.getStockAddTickets())
                .isGuest(false)
                .resetCount(guestUser.getResetCount())
                .lastResetDate(guestUser.getLastResetDate())
                .dividendTotal(guestUser.getDividendTotal())
                .build();
        userRepository.save(googleUser);

        // Bulk-migrate all records that have a FK pointing to the guest over to the Google account
        userShareRepository.updateUserId(guestUid, googleUid);
        orderRepository.updateUserId(guestUid, googleUid);
        deviceMappingRepository.updateUid(guestUid, googleUid);

        // Delete the guest user (user_shares and orders will be removed via ON DELETE CASCADE)
        userRepository.deleteById(guestUid);

        tradeEngine.evictUserCache(guestUid);
        tradeEngine.evictUserCache(googleUid);
    }

    @Transactional
    public void upgradeGuest(String uid) {
        User user = userRepository.findById(uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));
        user.markAsRegistered();
        tradeEngine.evictUserCache(uid);
    }
}
