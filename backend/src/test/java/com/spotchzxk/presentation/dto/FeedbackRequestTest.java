package com.spotchzxk.presentation.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FeedbackRequestTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void acceptsBlankOrHttpPageUrl() {
        assertThat(validator.validate(requestWithPageUrl(null))).isEmpty();
        assertThat(validator.validate(requestWithPageUrl(""))).isEmpty();
        assertThat(validator.validate(requestWithPageUrl("https://spotchzxk.xyz/stocks/abc"))).isEmpty();
        assertThat(validator.validate(requestWithPageUrl("http://localhost:5173/prices"))).isEmpty();
    }

    @Test
    void rejectsNonHttpPageUrlOrHtmlLikeValue() {
        assertThat(validator.validate(requestWithPageUrl("javascript:alert(1)"))).isNotEmpty();
        assertThat(validator.validate(requestWithPageUrl("<script>alert(1)</script>"))).isNotEmpty();
        assertThat(validator.validate(requestWithPageUrl("https://spotchzxk.xyz/<script>"))).isNotEmpty();
    }

    private FeedbackRequest requestWithPageUrl(String pageUrl) {
        return new FeedbackRequest(
                "BUG",
                "title",
                "content",
                null,
                pageUrl
        );
    }
}
