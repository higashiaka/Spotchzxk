package com.spotchzxk.service;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.spotchzxk.entity.DeviceMapping;
import com.spotchzxk.repository.DeviceMappingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class GuestService {

    private final DeviceMappingRepository deviceMappingRepository;

    @Transactional
    public Map<String, String> registerGuest(String fingerprint, String uid) throws FirebaseAuthException {
        Optional<DeviceMapping> existing = deviceMappingRepository.findById(fingerprint);

        if (existing.isEmpty()) {
            deviceMappingRepository.save(DeviceMapping.builder()
                    .fingerprint(fingerprint)
                    .uid(uid)
                    .build());
            return Map.of("canonicalUid", uid);
        }

        String canonicalUid = existing.get().getUid();
        if (canonicalUid.equals(uid)) {
            return Map.of("canonicalUid", canonicalUid);
        }

        // 다른 기기에서 같은 fingerprint → 커스텀 토큰 발급해서 재로그인 유도
        String customToken = FirebaseAuth.getInstance().createCustomToken(canonicalUid);
        return Map.of("canonicalUid", canonicalUid, "customToken", customToken);
    }
}
