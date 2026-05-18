package com.spotchzxk.repository;

import com.spotchzxk.entity.DividendLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface DividendLogRepository extends JpaRepository<DividendLog, Long> {
}
