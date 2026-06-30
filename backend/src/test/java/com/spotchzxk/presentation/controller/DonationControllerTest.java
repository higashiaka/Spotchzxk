package com.spotchzxk.presentation.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spotchzxk.application.PortfolioService;
import com.spotchzxk.application.TradeEngine;
import com.spotchzxk.domain.stock.repository.StockRepository;
import com.spotchzxk.domain.user.repository.CheerLogRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DonationControllerTest {

    @Test
    void donateReturnsServerErrorWhenTransactionProducesNoResponse() {
        PortfolioService portfolioService = mock(PortfolioService.class);
        UserRepository userRepository = mock(UserRepository.class);
        StockRepository stockRepository = mock(StockRepository.class);
        CheerLogRepository cheerLogRepository = mock(CheerLogRepository.class);
        TradeEngine tradeEngine = mock(TradeEngine.class);
        TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
        DonationController controller = new DonationController(
                portfolioService,
                userRepository,
                stockRepository,
                cheerLogRepository,
                tradeEngine,
                transactionTemplate
        );
        ObjectMapper objectMapper = new ObjectMapper();
        JsonNode body = objectMapper.createObjectNode().put("amount", 1_000);

        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(tradeEngine).runWithUserLock(any(), any(Runnable.class));
        when(transactionTemplate.execute(any())).thenReturn(null);

        ResponseEntity<?> response = controller.donate(body, "user-1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isInstanceOf(Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> bodyMap = (Map<String, Object>) response.getBody();
        assertThat(bodyMap).containsEntry("error", "후원 처리 중 오류가 발생했습니다.");
    }
}
