package com.spotchzxk.presentation.controller;

import com.spotchzxk.application.TitleResponseMapper;
import com.spotchzxk.domain.user.entity.Title;
import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.domain.user.repository.TitleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/rankings")
@RequiredArgsConstructor
public class RankingController {

    private final UserRepository userRepository;
    private final TitleRepository titleRepository;
    private final TitleResponseMapper titleResponseMapper;

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getRankings(
            @RequestParam(defaultValue = "realized") String type
    ) {
        var users = switch (type) {
            case "dividend" -> userRepository.findTop50NonGuestNonBotByDividendTotal();
            case "donation" -> userRepository.findTop50NonGuestNonBotByDonationTotal();
            default -> userRepository.findTop50NonGuestNonBotByRealizedProfit();
        };
        Map<Long, Title> selectedTitles = titleRepository.findByIdIn(users.stream()
                        .map(user -> user.getSelectedTitleId())
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList())
                .stream()
                .collect(Collectors.toMap(Title::getId, Function.identity()));

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

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("rank", i + 1);
            row.put("displayName", displayName);
            row.put("profileImageUrl", profileImageUrl);
            row.put("value", value);
            row.put("realizedProfit", realizedProfit);
            row.put("dividendTotal", dividendTotal);
            row.put("donationTotal", donationTotal);

            Title selectedTitle = user.getSelectedTitleId() != null ? selectedTitles.get(user.getSelectedTitleId()) : null;
            if (selectedTitle != null && user.getId().equals(selectedTitle.getUserId())) {
                Map<String, Object> title = titleResponseMapper.toResponse(selectedTitle);
                row.put("titleLabel", title.get("label"));
                row.put("titleTone", title.get("tone"));
            }
            rankings.add(row);
        }
        return ResponseEntity.ok(rankings);
    }
}


