package com.spotchzxk.controller;

import com.google.firebase.auth.FirebaseAuthException;
import com.spotchzxk.dto.GuestRegisterRequest;
import com.spotchzxk.service.GuestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/guest")
@RequiredArgsConstructor
public class GuestController {

    private final GuestService guestService;

    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(@Valid @RequestBody GuestRegisterRequest req)
            throws FirebaseAuthException {
        Map<String, String> result = guestService.registerGuest(req.getFingerprint(), req.getUid());
        return ResponseEntity.ok(result);
    }
}
