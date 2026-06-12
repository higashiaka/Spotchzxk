package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class GuestService {

    // Issue #4: raised initial balance to 10,000,000 (was 1,000,000) to accommodate megaphone and stock-add costs
    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(10_000_000);

    private final UserRepository userRepository;

    public boolean exists(String uid) {
        return userRepository.existsById(uid);
    }

    @Transactional
    public Map<String, String> registerGuest(String uid) {
        User user = userRepository.findById(uid)
                .orElse(User.builder().id(uid).coinBalance(INITIAL_BALANCE).build());
        user.markAsGuest();
        userRepository.save(user);
        return Map.of("canonicalUid", uid);
    }
}


