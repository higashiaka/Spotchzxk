package com.spotchzxk.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record FeedbackRequest(
        @NotBlank
        @Pattern(regexp = "BUG|SUGGESTION|ACCOUNT|STOCK|REPORT|OTHER")
        String category,

        @NotBlank
        @Size(max = 100)
        String title,

        @NotBlank
        @Size(max = 3000)
        String content,

        @Size(max = 500)
        String pageUrl
) {
}
