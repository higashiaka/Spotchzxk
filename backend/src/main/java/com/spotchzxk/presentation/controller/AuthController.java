package com.spotchzxk.presentation.controller;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserRepository userRepository;

    @GetMapping("/me")
    public ResponseEntity<?> getAuthMe() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return ResponseEntity.ok(Map.of("authenticated", false));
        }
        String uid = String.valueOf(auth.getPrincipal());
        User user = userRepository.findById(uid).orElse(null);
        if (user != null && user.isSuspensionActive(LocalDateTime.now())) {
            return ResponseEntity.ok(Map.of(
                "authenticated", true,
                "principal", uid,
                "suspended", true,
                "suspensionReason", user.getSuspensionReason() == null ? "Policy violation" : user.getSuspensionReason(),
                "suspendedUntil", user.getSuspendedUntil().toString(),
                "authorities", auth.getAuthorities().stream()
                    .map(a -> a.getAuthority())
                    .toList()
            ));
        }
        return ResponseEntity.ok(Map.of(
            "authenticated", auth.isAuthenticated(),
            "principal", auth.getPrincipal(),
            "suspended", false,
            "authorities", auth.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .toList()
        ));
    }
}


