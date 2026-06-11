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

    // Issue #4: 珥덇린 ?붿븸 10,000,000??(湲곗〈 1,000,000? ?뺤꽦湲?醫낅ぉ異붽?沅?援щℓ 遺덇? ?섏?)
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


