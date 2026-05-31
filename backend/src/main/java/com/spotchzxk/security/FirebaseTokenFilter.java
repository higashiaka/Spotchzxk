package com.spotchzxk.security;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.spotchzxk.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@RequiredArgsConstructor
public class FirebaseTokenFilter extends OncePerRequestFilter {

    private final UserRepository userRepository;

    // Google 연동 완료 확인이 끝난 UID 캐시 — 재시작 전까지 반복 DB 조회 방지
    private final Set<String> checkedUids = ConcurrentHashMap.newKeySet();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(token);
                String uid = decoded.getUid();

                List<GrantedAuthority> authorities = new ArrayList<>();
                boolean isGoogle = false;
                Object firebaseObj = decoded.getClaims().get("firebase");
                if (firebaseObj instanceof Map<?, ?> firebaseClaims) {
                    isGoogle = "google.com".equals(firebaseClaims.get("sign_in_provider"));
                    if (!isGoogle) {
                        Object identitiesObj = firebaseClaims.get("identities");
                        if (identitiesObj instanceof Map<?, ?> identities) {
                            isGoogle = identities.containsKey("google.com");
                        }
                    }
                    if (isGoogle) {
                        authorities.add(new SimpleGrantedAuthority("ROLE_GOOGLE"));
                    }
                }

                if (isGoogle && !checkedUids.contains(uid)) {
                    tryUpgradeGuestToRegistered(uid);
                }

                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(uid, null, authorities);
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (FirebaseAuthException e) {
                SecurityContextHolder.clearContext();
            }
        }
        chain.doFilter(request, response);
    }

    private void tryUpgradeGuestToRegistered(String uid) {
        try {
            userRepository.findById(uid).ifPresent(user -> {
                if (user.isGuest()) {
                    user.markAsRegistered();
                    userRepository.save(user);
                    log.info("Auto-upgraded guest to registered: uid={}", uid);
                }
            });
            checkedUids.add(uid);
        } catch (Exception e) {
            log.warn("Failed to auto-upgrade guest for uid={}: {}", uid, e.getMessage());
        }
    }
}
