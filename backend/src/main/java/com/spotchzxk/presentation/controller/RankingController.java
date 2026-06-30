package com.spotchzxk.presentation.controller;

import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
    public ResponseEntity<List<Map<String, Object>>> getRankings(
            @RequestParam(defaultValue = "realized") String type
    ) {
        var users = switch (type) {
            case "dividend" -> userRepository.findTop50NonGuestNonBotByDividendTotal();
            case "donation" -> userRepository.findTop50NonGuestNonBotByDonationTotal();
            default -> userRepository.findTop50NonGuestNonBotByRealizedProfit();
        };

        List<Map<String, Object>> rankings = new ArrayList<>();
        for (int i = 0; i < users.size(); i++) {
            var user = users.get(i);
            String displayName = user.isRankingNicknamePublic()
                    ? (user.getDisplayName() == null || user.getDisplayName().isBlank()
                            ? "Anonymous"
                            : user.getDisplayName())
                    : "Private";
            String profileImageUrl = user.isRankingNicknamePublic() && user.getProfileImageUrl() != null
                    ? user.getProfileImageUrl()
                    : "";
            BigDecimal realizedProfit = user.getRealizedProfit() != null ? user.getRealizedProfit() : BigDecimal.ZERO;
            BigDecimal dividendTotal = user.getDividendTotal() != null ? user.getDividendTotal() : BigDecimal.ZERO;
            BigDecimal donationTotal = user.getDonationTotal() != null ? user.getDonationTotal() : BigDecimal.ZERO;

            BigDecimal value = switch (type) {
                case "dividend" -> dividendTotal;
                case "donation" -> donationTotal;
                default -> realizedProfit;
            };

            rankings.add(Map.of(
                    "rank", i + 1,
                    "displayName", displayName,
                    "profileImageUrl", profileImageUrl,
                    "value", value,
                    "realizedProfit", realizedProfit,
                    "dividendTotal", dividendTotal,
                    "donationTotal", donationTotal
            ));
        }
        return ResponseEntity.ok(rankings);
    }
}


