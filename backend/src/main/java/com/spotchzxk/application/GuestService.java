package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class GuestService {

    private final UserRepository userRepository;

    public boolean exists(String uid) {
        return userRepository.existsById(uid);
    }

    public boolean requiresPrecheckForGuestRegistration(String uid) {
        return !userRepository.existsById(uid);
    }

    @Transactional
    public Map<String, String> registerGuest(String uid) {
        User existing = userRepository.findById(uid).orElse(null);
        if (existing != null && !existing.isGuest()) {
            // registered account — do not downgrade to guest
            return Map.of("canonicalUid", uid);
        }
        User user = existing != null
                ? existing
                : User.builder().id(uid).coinBalance(InitialBalancePolicy.GOOGLE_INITIAL_BALANCE).build();
        user.markAsGuest();
        userRepository.save(user);
        return Map.of("canonicalUid", uid);
    }
}


