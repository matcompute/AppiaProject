package com.appia.repository;

import com.appia.model.PlacementRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface PlacementRecordRepository extends JpaRepository<PlacementRecord, Long> {

    List<PlacementRecord> findBySfcIdOrderByPlacedAtDesc(String sfcId);

    List<PlacementRecord> findByNodeIdOrderByPlacedAtDesc(String nodeId);

    @Query("SELECT AVG(r.carbonIntensityAtPlacement) FROM PlacementRecord r WHERE r.slaWasMet = true")
    Double avgCarbonWhenSlaWasMet();

    @Query("SELECT COUNT(r) FROM PlacementRecord r WHERE r.slaWasMet = false AND r.sfcPriority = 'CRITICAL'")
    Long countCriticalViolations();

    @Query("SELECT r FROM PlacementRecord r ORDER BY r.placedAt DESC")
    List<PlacementRecord> findRecentPlacements(org.springframework.data.domain.Pageable pageable);
}
