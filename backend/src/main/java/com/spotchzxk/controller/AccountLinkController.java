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
     * Merges a guest account into the currently logged-in Google account.
     * Only called when Firebase linkWithPopup fails with auth/credential-already-in-use.
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
