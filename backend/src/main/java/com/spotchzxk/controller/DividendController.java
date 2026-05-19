package com.spotchzxk.controller;

import com.spotchzxk.entity.DividendLog;
import com.spotchzxk.repository.DividendLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/dividends")
@RequiredArgsConstructor
public class DividendController {

    private final DividendLogRepository dividendLogRepository;

    @GetMapping("/recent")
    public ResponseEntity<List<Map<String, Object>>> getRecentDividends() {
        List<DividendLog> logs = dividendLogRepository.findTop30ByOrderByCreatedAtDesc();
        List<Map<String, Object>> result = logs.stream().map(log -> Map.<String, Object>of(
                "channelId", log.getStock().getChannelId(),
                "streamerName", log.getStock().getStreamerName(),
                "profileImageUrl", log.getStock().getProfileImageUrl() != null ? log.getStock().getProfileImageUrl() : "",
                "totalDividendPool", log.getTotalDividendPool(),
                "streamMinutes", log.getStreamMinutes() != null ? log.getStreamMinutes() : 0L,
                "createdAt", log.getCreatedAt().toString()
        )).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }
}
