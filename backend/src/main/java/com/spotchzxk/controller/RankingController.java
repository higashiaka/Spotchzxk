package com.spotchzxk.controller;

import com.spotchzxk.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rankings")
@RequiredArgsConstructor
public class RankingController {

    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getRankings() {
        var users = userRepository.findTop50ByIsBotFalseOrderByRealizedProfitDesc();
        List<Map<String, Object>> rankings = new ArrayList<>();
        for (int i = 0; i < users.size(); i++) {
            var user = users.get(i);
            String displayName = user.isRankingNicknamePublic()
                    ? (user.getDisplayName() == null || user.getDisplayName().isBlank()
                            ? "트레이더"
                            : user.getDisplayName())
                    : "비공개";
            rankings.add(Map.of(
                    "rank", i + 1,
                    "displayName", displayName,
                    "realizedProfit", user.getRealizedProfit() != null ? user.getRealizedProfit() : BigDecimal.ZERO
            ));
        }
        return ResponseEntity.ok(rankings);
    }
}
