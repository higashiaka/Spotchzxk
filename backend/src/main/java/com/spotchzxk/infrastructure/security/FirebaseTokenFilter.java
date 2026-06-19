package com.spotchzxk.infrastructure.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.application.AccountLinkService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
public class FirebaseTokenFilter extends OncePerRequestFilter {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final UserRepository userRepository;
    private final AccountLinkService accountLinkService;
    private final boolean firebaseEnabled;

    public FirebaseTokenFilter(UserRepository userRepository, AccountLinkService accountLinkService, boolean firebaseEnabled) {
        this.userRepository = userRepository;
        this.accountLinkService = accountLinkService;
        this.firebaseEnabled = firebaseEnabled;
    }

    // Issue #32: ConcurrentHashMap never expires; use Caffeine with TTL to avoid unbounded JVM heap growth
    // 30-min TTL: guest accounts refresh frequently — shorter than session lifetime but sufficient to avoid hammering Firebase
    private final Cache<String, Boolean> checkedUids = Caffeine.newBuilder()
            .expireAfterWrite(30, TimeUnit.MINUTES)
            .build();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (!firebaseEnabled) {
            chain.doFilter(request, response);
            return;
        }
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

                if (isGoogle && checkedUids.getIfPresent(uid) == null) {
                    tryUpgradeGuestToRegistered(uid);
                }

                var user = userRepository.findById(uid).orElse(null);
                if (user != null && user.isSuspensionActive(LocalDateTime.now(KST)) && !isAuthMeRequest(request)) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("""
                            {"error":"ACCOUNT_SUSPENDED","message":"Account is suspended."}
                            """);
                    return;
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

    private boolean isAuthMeRequest(HttpServletRequest request) {
        return "GET".equalsIgnoreCase(request.getMethod()) && "/api/auth/me".equals(request.getRequestURI());
    }

    private void tryUpgradeGuestToRegistered(String uid) {
        try {
            userRepository.findById(uid).ifPresent(user -> {
                if (user.isGuest()) {
                    accountLinkService.upgradeGuest(uid);
                    log.info("Auto-upgraded guest to registered: uid={}", uid);
                }
            });
            checkedUids.put(uid, Boolean.TRUE);
        } catch (Exception e) {
            log.warn("Failed to auto-upgrade guest for uid={}: {}", uid, e.getMessage());
        }
    }
}


