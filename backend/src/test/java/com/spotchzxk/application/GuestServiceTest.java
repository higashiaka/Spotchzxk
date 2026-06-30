package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GuestServiceTest {

    @Test
    void requiresPrecheckWhenGuestUserDoesNotExist() {
        UserRepository userRepository = mock(UserRepository.class);
        when(userRepository.existsById("guest-1")).thenReturn(false);
        GuestService guestService = new GuestService(userRepository);

        assertThat(guestService.requiresPrecheckForGuestRegistration("guest-1")).isTrue();
        verify(userRepository).existsById("guest-1");
    }

    @Test
    void skipsPrecheckWhenExistingUserIsGuest() {
        User guest = User.builder()
                .id("guest-1")
                .coinBalance(BigDecimal.ZERO)
                .build();
        guest.markAsGuest();
        UserRepository userRepository = mock(UserRepository.class);
        when(userRepository.existsById("guest-1")).thenReturn(true);
        GuestService guestService = new GuestService(userRepository);

        assertThat(guestService.requiresPrecheckForGuestRegistration("guest-1")).isFalse();
    }

    @Test
    void skipsPrecheckOnlyForRegisteredUser() {
        User registered = User.builder()
                .id("user-1")
                .coinBalance(BigDecimal.ZERO)
                .build();
        registered.markAsRegistered();
        UserRepository userRepository = mock(UserRepository.class);
        when(userRepository.existsById("user-1")).thenReturn(true);
        GuestService guestService = new GuestService(userRepository);

        assertThat(guestService.requiresPrecheckForGuestRegistration("user-1")).isFalse();
    }
}
