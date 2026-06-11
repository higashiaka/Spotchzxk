package com.spotchzxk.presentation.dto;

import jakarta.validation.constraints.NotBlank;

public record LinkGoogleRequest(
        @NotBlank String guestUid
) {}


