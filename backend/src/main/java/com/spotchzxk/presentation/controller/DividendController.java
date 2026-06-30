package com.spotchzxk.presentation.controller;

import com.spotchzxk.domain.dividend.entity.DividendLog;
import com.spotchzxk.domain.user.entity.UserDividendLog;
import com.spotchzxk.domain.dividend.repository.DividendLogRepository;
import com.spotchzxk.domain.user.repository.UserDividendLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/dividends")
@RequiredArgsConstructor
public class DividendController {

    private final DividendLogRepository dividendLogRepository;
    private final UserDividendLogRepository userDividendLogRepository;
    private static final String FALLBACK_CREATED_AT = "1970-01-01T00:00:00";

    @GetMapping("/recent")
    public ResponseEntity<List<Map<String, Object>>> getRecentDividends() {
        List<DividendLog> logs = dividendLogRepository.findTop30ByOrderByCreatedAtDesc();
        List<Map<String, Object>> result = logs.stream().map(log -> Map.<String, Object>of(
                "channelId", log.getStock().getChannelId(),
                "streamerName", log.getStock().getStreamerName(),
                "profileImageUrl", log.getStock().getProfileImageUrl() != null ? log.getStock().getProfileImageUrl() : "",
                "totalDividendPool", log.getTotalDividendPool(),
                "streamMinutes", log.getStreamMinutes() != null ? log.getStreamMinutes() : 0L,
                "createdAt", log.getCreatedAt() != null ? log.getCreatedAt().toString() : FALLBACK_CREATED_AT
        )).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/my")
    public ResponseEntity<List<Map<String, Object>>> getMyDividends(@AuthenticationPrincipal String uid) {
        if (uid == null) return ResponseEntity.status(401).build();

        List<UserDividendLog> logs = userDividendLogRepository.findTop50ByUserIdOrderByCreatedAtDesc(uid);
        List<Map<String, Object>> result = logs.stream()
                .filter(log -> log.getAmount() != null && log.getAmount().compareTo(java.math.BigDecimal.ZERO) != 0)
                .map(log -> Map.<String, Object>of(
                "channelId", log.getChannelId(),
                "streamerName", log.getStreamerName(),
                "profileImageUrl", log.getProfileImageUrl() != null ? log.getProfileImageUrl() : "",
                "quantity", absOrZero(log.getQuantity()),
                "ratePerShare", absOrZero(log.getRatePerShare()),
                "amount", absOrZero(log.getAmount()),
                "createdAt", log.getCreatedAt() != null ? log.getCreatedAt().toString() : FALLBACK_CREATED_AT
        )).collect(Collectors.<Map<String, Object>>toList());
        return ResponseEntity.ok(result);
    }

    private BigDecimal absOrZero(BigDecimal value) {
        return value != null ? value.abs() : BigDecimal.ZERO;
    }
}

