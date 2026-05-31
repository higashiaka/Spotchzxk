package com.spotchzxk.controller;

import com.spotchzxk.dto.LinkGoogleRequest;
import com.spotchzxk.service.AccountLinkService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AccountLinkController {

    private final AccountLinkService accountLinkService;

    /**
     * 게스트 계정을 현재 로그인된 Google 계정으로 병합한다.
     * Firebase linkWithPopup이 auth/credential-already-in-use로 실패했을 때만 호출된다.
     */
    @PostMapping("/link-google")
    public ResponseEntity<Void> linkGoogle(
            @AuthenticationPrincipal String googleUid,
            @Valid @RequestBody LinkGoogleRequest req) {
        accountLinkService.mergeGuestIntoGoogle(req.guestUid(), googleUid);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/upgrade-guest")
    public ResponseEntity<Void> upgradeGuest(@AuthenticationPrincipal String uid) {
        accountLinkService.upgradeGuest(uid);
        return ResponseEntity.ok().build();
    }
}
