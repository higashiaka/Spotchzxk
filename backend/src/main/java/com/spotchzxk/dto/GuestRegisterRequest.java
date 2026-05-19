package com.spotchzxk.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
public class GuestRegisterRequest {

    @NotBlank
    private String fingerprint;

    private String uid;
}
