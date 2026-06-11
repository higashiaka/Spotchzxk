package com.spotchzxk.presentation.dto;

import com.spotchzxk.domain.order.entity.Order;

import java.math.BigDecimal;

public record PublicOrderResponse(
        String id,
        String streamerId,
        String type,
        long quantity,
        BigDecimal estimatedPrice,
        BigDecimal executedPrice,
        String status,
        String orderMode,
        BigDecimal limitPrice,
        long createdAt,
        Long executedAt
) {
    public static PublicOrderResponse from(Order order) {
        return new PublicOrderResponse(
                order.getId(),
                order.getStreamerId(),
                order.getType(),
                order.getQuantity(),
                order.getEstimatedPrice(),
                order.getExecutedPrice(),
                order.getStatus(),
                order.getOrderMode(),
                order.getLimitPrice(),
                order.getCreatedAt(),
                order.getExecutedAt()
        );
    }
}


