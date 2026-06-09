package com.spotchzxk.dto;

public record GuestRegisterRequest(
        String precheckToken,
        String fingerprintHash
) {
}
