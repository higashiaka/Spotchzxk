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
    private final TitleResponseMapper titleResponseMapper;

    public Map<String, Object> getInventory(String userId) {
        User user = portfolioService.getOrCreate(userId);
        List<Map<String, Object>> items = new ArrayList<>();
        if (user.getNicknameChangeTickets() > 0) {
            items.add(item("nickname-change-ticket", "닉네임 변경권", user.getNicknameChangeTickets()));
        }
        if (user.getStockAddTickets() > 0) {
            items.add(item("stock-add-ticket", "종목 추가 티켓", user.getStockAddTickets()));
        }
        if (user.getMegaphoneTickets() > 0) {
            items.add(item("megaphone-ticket", "Megaphone Ticket", user.getMegaphoneTickets()));
        }
        items.addAll(userItemRepository.findByUserIdOrderByUpdatedAtDesc(userId).stream()
                .filter(i -> i.getQuantity() > 0)
                .map(i -> item(i.getItemType(), i.getItemName(), i.getQuantity()))
                .toList());

        List<Map<String, Object>> titles = titleRepository.findByUserIdOrderByGrantedAtDesc(userId).stream()
                .map(titleResponseMapper::toResponse)
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

}
