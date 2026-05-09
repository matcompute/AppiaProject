package com.appia.repository;

import com.appia.model.NetworkSlice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface NetworkSliceRepository extends JpaRepository<NetworkSlice, Long> {

    Optional<NetworkSlice> findBySliceId(String sliceId);

    List<NetworkSlice> findBySliceType(NetworkSlice.SliceType type);

    List<NetworkSlice> findByStatusOrderByPriorityAsc(NetworkSlice.SliceStatus status);

    @Query("SELECT s FROM NetworkSlice s WHERE s.status = 'ACTIVE' ORDER BY s.priority ASC")
    List<NetworkSlice> findActiveSlices();

    @Query("SELECT COUNT(s) FROM NetworkSlice s WHERE s.status = 'DEGRADED'")
    long countDegraded();

    @Query("SELECT AVG(s.slaComplianceScore) FROM NetworkSlice s WHERE s.status != 'TERMINATED'")
    Double avgComplianceScore();
}
