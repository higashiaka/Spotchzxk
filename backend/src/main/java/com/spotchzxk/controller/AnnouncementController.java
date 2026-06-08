package com.spotchzxk.controller;

import com.spotchzxk.entity.StockSplitNotice;
import com.spotchzxk.service.StockSplitService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/announcements")
@RequiredArgsConstructor
public class AnnouncementController {

    private final StockSplitService stockSplitService;

    @GetMapping("/stock-splits/latest")
    public ResponseEntity<StockSplitNotice> getLatestStockSplitNotice() {
        StockSplitNotice notice = stockSplitService.getLatestNotice();
        return notice == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(notice);
    }
}
