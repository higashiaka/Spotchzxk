package com.spotchzxk.repository;

import com.spotchzxk.entity.DeviceMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeviceMappingRepository extends JpaRepository<DeviceMapping, String> {

    @Modifying
    @Query(value = "UPDATE device_mappings SET uid = :newUid WHERE uid = :oldUid", nativeQuery = true)
    void updateUid(@Param("oldUid") String oldUid, @Param("newUid") String newUid);
}
