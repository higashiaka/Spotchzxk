package com.spotchzxk.application;

import com.spotchzxk.infrastructure.config.GuestAbuseProperties;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class GuestAbuseProtectionServiceTest {

    private final GuestAbuseProtectionService service = new GuestAbuseProtectionService(
            new GuestAbuseProperties(true, 180, 5, 600, List.of("127.0.0.1/32")),
            mock(StringRedisTemplate.class)
    );

    @Test
    void networkKeyUsesIpv4Slash24() {
        assertThat(service.networkKey("192.168.10.123")).isEqualTo("192.168.10.0/24");
    }

    @Test
    void networkKeyUsesIpv6Slash64FromParsedAddress() {
        assertThat(service.networkKey("2001:db8:abcd:12::1")).isEqualTo("2001:0db8:abcd:0012::/64");
        assertThat(service.networkKey("::1")).isEqualTo("0000:0000:0000:0000::/64");
    }

    @Test
    void networkKeyTreatsIpv4MappedAddressAsIpv4() {
        assertThat(service.networkKey("::ffff:192.168.10.123")).isEqualTo("192.168.10.0/24");
    }
}
