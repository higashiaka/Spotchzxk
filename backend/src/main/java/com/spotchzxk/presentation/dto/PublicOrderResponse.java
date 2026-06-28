package com.spotchzxk.presentation.dto;

import com.spotchzxk.domain.order.entity.Order;

import java.math.BigDecimal;

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
        return from(order, order.getQuantity());
    }

    public static PublicOrderResponse fromExecutedTrade(Order order) {
        BigDecimal executedQuantity = order.getFilledQuantity() != null
                && order.getFilledQuantity().compareTo(BigDecimal.ZERO) > 0
                && order.getFilledQuantity().compareTo(order.getQuantity()) < 0
                ? order.getFilledQuantity()
                : order.getQuantity();
        return from(order, executedQuantity);
    }

    private static PublicOrderResponse from(Order order, BigDecimal quantity) {
        return new PublicOrderResponse(
                order.getId(),
                order.getStreamerId(),
                order.getType(),
                quantity.toPlainString(),
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


