package com.spotchzxk.application;

import com.spotchzxk.domain.user.entity.Title;
import com.spotchzxk.domain.user.entity.User;
import com.spotchzxk.domain.user.entity.UserItem;
import com.spotchzxk.domain.user.repository.TitleRepository;
import com.spotchzxk.domain.user.repository.UserItemRepository;
import com.spotchzxk.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class InventoryService {

    private final PortfolioService portfolioService;
    private final UserRepository userRepository;
    private final TitleRepository titleRepository;
    private final UserItemRepository userItemRepository;

    public Map<String, Object> getInventory(String userId) {
        User user = portfolioService.getOrCreate(userId);
        List<Map<String, Object>> items = new ArrayList<>();
        if (user.getNicknameChangeTickets() > 0) {
            items.add(item("nickname-change-ticket", "닉네임 변경권", user.getNicknameChangeTickets()));
        }
        if (user.getStockAddTickets() > 0) {
            items.add(item("stock-add-ticket", "종목 추가 티켓", user.getStockAddTickets()));
        }
        items.addAll(userItemRepository.findByUserIdOrderByUpdatedAtDesc(userId).stream()
                .filter(i -> i.getQuantity() > 0)
                .map(i -> item(i.getItemType(), i.getItemName(), i.getQuantity()))
                .toList());

        List<Map<String, Object>> titles = titleRepository.findByUserIdOrderByGrantedAtDesc(userId).stream()
                .map(this::title)
                .toList();

        Map<String, Object> response = new HashMap<>();
        response.put("items", items);
        response.put("titles", titles);
        response.put("selectedTitleId", user.getSelectedTitleId());
        return response;
    }

    @Transactional
    public Map<String, Object> selectTitle(String userId, Long titleId) {
        User user = portfolioService.getOrCreate(userId);
        if (titleId != null && !titleRepository.existsByIdAndUserId(titleId, userId)) {
            throw new IllegalStateException("보유하지 않은 칭호입니다.");
        }
        user.selectTitle(titleId);
        userRepository.save(user);
        Map<String, Object> response = new HashMap<>();
        response.put("selectedTitleId", titleId);
        return response;
    }

    private Map<String, Object> item(String type, String name, long quantity) {
        return Map.of(
                "type", type,
                "name", name,
                "quantity", quantity
        );
    }

    private Map<String, Object> title(Title title) {
        return Map.of(
                "id", title.getId(),
                "label", titleLabel(title.getTitleType()),
                "description", titleDescription(title),
                "tone", titleTone(title.getTitleType()),
                "awardedAt", title.getGrantedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    private String titleLabel(String type) {
        return switch (type) {
            case "BETA_SEASON" -> "베타 개척자";
            case "BETA_TIER" -> "베타 티어";
            case "BETA_REALIZED_TOP" -> "베타 수익왕";
            case "BETA_DIVIDEND_TOP" -> "베타 배당왕";
            case "BETA_FAN_TOP" -> "베타 대표 팬";
            case "CHEER_1" -> "후원 팬";
            case "CHEER_2" -> "열성 팬";
            case "CHEER_3" -> "대표 팬";
            default -> type;
        };
    }

    private String titleDescription(Title title) {
        if (title.getStockId() != null && title.getTitleType().startsWith("CHEER_")) {
            return "이 스트리머 종목의 팬 랭킹 칭호";
        }
        if ("BETA_TIER".equals(title.getTitleType())) {
            return "베타 시즌 종료 시점의 최종 티어 기준 칭호";
        }
        return "정식 전환 및 시즌 보상 칭호";
    }

    private String titleTone(String type) {
        return switch (type) {
            case "BETA_SEASON", "BETA_TIER", "CHEER_3" -> "gold";
            case "BETA_DIVIDEND_TOP" -> "blue";
            case "BETA_REALIZED_TOP", "CHEER_2" -> "green";
            case "BETA_FAN_TOP", "CHEER_1" -> "red";
            default -> "gray";
        };
    }
}
