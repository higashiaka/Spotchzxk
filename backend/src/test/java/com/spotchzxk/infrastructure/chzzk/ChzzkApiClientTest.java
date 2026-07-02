package com.spotchzxk.infrastructure.chzzk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spotchzxk.application.EnvResolver;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class ChzzkApiClientTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ChzzkApiClient client = new ChzzkApiClient(mock(EnvResolver.class), objectMapper);

    @Test
    void interpretLiveStatusUsesExplicitStatusWhenPresent() throws Exception {
        JsonNode content = objectMapper.readTree("""
                {"status":"open","liveTitle":"Live now"}
                """);

        assertThat(client.interpretLiveStatus(content)).isEqualTo("OPEN");
    }

    @Test
    void interpretLiveStatusTreatsLiveMetadataAsOpenWhenStatusIsMissing() throws Exception {
        JsonNode content = objectMapper.readTree("""
                {"liveId":"123456","liveTitle":"Live now"}
                """);

        assertThat(client.interpretLiveStatus(content)).isEqualTo("OPEN");
    }

    @Test
    void interpretLiveStatusDefaultsToCloseWithoutLiveSignals() throws Exception {
        JsonNode content = objectMapper.readTree("""
                {"channelName":"Offline channel"}
                """);

        assertThat(client.interpretLiveStatus(content)).isEqualTo("CLOSE");
    }
}
