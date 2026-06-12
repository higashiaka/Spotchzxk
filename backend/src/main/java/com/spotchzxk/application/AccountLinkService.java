package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.order.repository.OrderRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.domain.user.repository.UserShareRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AccountLinkService {

    private final UserRepository userRepository;
    private final UserShareRepository userShareRepository;
    private final OrderRepository orderRepository;
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

        if (userRepository.existsById(googleUid)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Google account already exists; refusing to overwrite it with guest data."
            );
        }

        // Create Google user by transferring the guest balance and profile data.
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
                .donationTotal(guestUser.getDonationTotal())
                .build();
        try {
            userRepository.saveAndFlush(googleUser);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 연결된 Google 계정입니다.",
                    e
            );
        }

        // Bulk-migrate all records that have a FK pointing to the guest over to the Google account
        userShareRepository.updateUserId(guestUid, googleUid);
        orderRepository.updateUserId(guestUid, googleUid);

        // Issue #14: migrate user_shares and orders to googleUid first, then delete guest User (no CASCADE)
        userRepository.deleteById(guestUid);

        // Cache eviction runs after commit to avoid evicting before the transaction is visible to other threads
        registerAfterCommit(() -> {
            tradeEngine.evictUserCache(guestUid);
            tradeEngine.evictUserCache(googleUid);
        });
    }

    @Transactional
    public void upgradeGuest(String uid) {
        User user = userRepository.findById(uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요."));
        user.markAsRegistered();
        registerAfterCommit(() -> tradeEngine.evictUserCache(uid));
    }

    private void registerAfterCommit(Runnable task) {
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


