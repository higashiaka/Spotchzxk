package com.spotchzxk.controller;

import com.spotchzxk.service.OnlineUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class OnlineController {

    private final OnlineUserService onlineUserService;

    @GetMapping("/api/online-count")
    public Map<String, Integer> getOnlineCount() {
        return Map.of("count", onlineUserService.getOnlineCount());
    }
}
