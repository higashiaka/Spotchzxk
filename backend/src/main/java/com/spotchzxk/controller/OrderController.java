package com.spotchzxk.controller;

import com.spotchzxk.entity.Order;
import com.spotchzxk.repository.OrderRepository;
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
    public ResponseEntity<List<Order>> getRecentOrders() {
        List<Order> orders = orderRepository.findTop50ByOrderByCreatedAtDesc();
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/api/orders/history")
    public ResponseEntity<List<Order>> getStockHistory(@RequestParam("streamerId") String streamerId) {
        if (streamerId == null || streamerId.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        List<Order> orders = orderRepository.findTop200ByStreamerIdAndStatusOrderByCreatedAtDesc(streamerId, "completed");
        return ResponseEntity.ok(orders);
    }
}
