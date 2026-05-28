package com.spotchzxk.service;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.spotchzxk.entity.DeviceMapping;
import com.spotchzxk.entity.User;
import com.spotchzxk.repository.DeviceMappingRepository;
import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class GuestService {

    private static final BigDecimal INITIAL_BALANCE = BigDecimal.valueOf(1_000_000);

    private final DeviceMappingRepository deviceMappingRepository;
    private final UserRepository userRepository;

    @Transactional
    public Map<String, String> registerGuest(String fingerprint, String uid) throws FirebaseAuthException {
        Optional<DeviceMapping> existing = deviceMappingRepository.findById(fingerprint);

        if (existing.isEmpty()) {
            deviceMappingRepository.save(DeviceMapping.builder()
                    .fingerprint(fingerprint)
                    .uid(uid)
                    .build());
            markGuest(uid);
            return Map.of("canonicalUid", uid);
        }

        String canonicalUid = existing.get().getUid();
        markGuest(canonicalUid);
        if (canonicalUid.equals(uid)) {
            return Map.of("canonicalUid", canonicalUid);
        }

        // 다른 기기에서 같은 fingerprint → 커스텀 토큰 발급해서 재로그인 유도
        String customToken = FirebaseAuth.getInstance().createCustomToken(canonicalUid);
        return Map.of("canonicalUid", canonicalUid, "customToken", customToken);
    }

    private void markGuest(String uid) {
        User user = userRepository.findById(uid)
                .orElse(User.builder().id(uid).coinBalance(INITIAL_BALANCE).build());
        user.setGuest(true);
        userRepository.save(user);
    }
}
