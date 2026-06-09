package com.spotchzxk.dto;

import jakarta.validation.constraints.NotBlank;

public record GuestPrecheckRequest(
        @NotBlank String fingerprintHash
) {
}
