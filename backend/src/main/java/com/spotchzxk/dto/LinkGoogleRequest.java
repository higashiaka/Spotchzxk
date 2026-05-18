package com.spotchzxk.dto;

import jakarta.validation.constraints.NotBlank;

public record LinkGoogleRequest(
        @NotBlank String guestUid
) {}
