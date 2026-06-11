package com.spotchzxk.presentation.dto;

public record GuestRegisterRequest(
        String precheckToken,
        String fingerprintHash
) {
}


