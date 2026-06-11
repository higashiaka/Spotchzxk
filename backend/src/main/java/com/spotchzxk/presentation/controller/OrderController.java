package com.spotchzxk.presentation.controller;

import com.spotchzxk.presentation.dto.PublicOrderResponse;
import com.spotchzxk.domain.order.entity.Order;
import com.spotchzxk.domain.order.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class OrderController {

    private final OrderRepository orderRepository;

    @GetMapping("/api/orders")
    public ResponseEntity<List<Order>> getOrders(@AuthenticationPrincipal String uid) {
        if (uid == null || uid.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        List<Order> orders = orderRepository.findByUserIdOrderByCreatedAtDesc(uid);
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/api/orders/recent")
    public ResponseEntity<List<PublicOrderResponse>> getRecentOrders() {
        List<PublicOrderResponse> orders = orderRepository.findTop50ByOrderByCreatedAtDesc()
                .stream().map(PublicOrderResponse::from).toList();
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/api/orders/history")
    public ResponseEntity<List<PublicOrderResponse>> getStockHistory(@RequestParam("streamerId") String streamerId) {
        if (streamerId == null || streamerId.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        List<PublicOrderResponse> orders = orderRepository
                .findTop200ByStreamerIdAndStatusOrderByTradedAtDesc(streamerId, "completed")
                .stream().map(PublicOrderResponse::from).toList();
        return ResponseEntity.ok(orders);
    }
}


