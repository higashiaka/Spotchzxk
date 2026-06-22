package com.spotchzxk.domain.trading.repository;

import com.spotchzxk.domain.trading.entity.TradeFailureLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TradeFailureLogRepository extends JpaRepository<TradeFailureLog, Long> {
}
