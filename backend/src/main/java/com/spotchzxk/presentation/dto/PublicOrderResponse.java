package com.spotchzxk.presentation.dto;

import com.spotchzxk.domain.order.entity.Order;

public record PublicOrderResponse(
        String id,
        String streamerId,
        String type,
        String quantity,
        String estimatedPrice,
        String executedPrice,
        String status,
        String orderMode,
        String limitPrice,
        long createdAt,
        Long executedAt
) {
    public static PublicOrderResponse from(Order order) {
        return new PublicOrderResponse(
                order.getId(),
                order.getStreamerId(),
                order.getType(),
                order.getQuantity().toPlainString(),
                order.getEstimatedPrice().toPlainString(),
                order.getExecutedPrice() != null ? order.getExecutedPrice().toPlainString() : null,
                order.getStatus(),
                order.getOrderMode(),
                order.getLimitPrice() != null ? order.getLimitPrice().toPlainString() : null,
                order.getCreatedAt(),
                order.getExecutedAt()
        );
    }
}


