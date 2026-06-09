package com.spotchzxk.service;

import com.spotchzxk.entity.User;
import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class GuestService {

    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(1_000_000);

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
