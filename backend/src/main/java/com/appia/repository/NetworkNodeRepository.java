package com.appia.repository;

import com.appia.model.NetworkNode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface NetworkNodeRepository extends JpaRepository<NetworkNode, String> {

    List<NetworkNode> findByStatus(NetworkNode.NodeStatus status);

    List<NetworkNode> findByNodeType(NetworkNode.NodeType type);

    @Query("SELECT n FROM NetworkNode n WHERE n.carbonIntensityGco2Kwh < :threshold ORDER BY n.carbonIntensityGco2Kwh ASC")
    List<NetworkNode> findGreenNodes(double threshold);

    @Query("SELECT n FROM NetworkNode n WHERE n.status = 'ONLINE' ORDER BY n.carbonIntensityGco2Kwh ASC")
    List<NetworkNode> findOnlineNodesByCarbon();

    @Query("SELECT n FROM NetworkNode n WHERE n.status = 'ONLINE' ORDER BY n.energyCostEurKwh ASC")
    List<NetworkNode> findOnlineNodesByCost();

    @Query("SELECT n FROM NetworkNode n WHERE n.status = 'ONLINE' " +
           "AND (n.cpuCapacityCores * (1.0 - n.cpuLoadPct/100.0)) >= :cpuReq " +
           "AND (n.memoryCapacityGb * (1.0 - n.memoryLoadPct/100.0)) >= :memReq")
    List<NetworkNode> findCapableNodes(double cpuReq, double memReq);
}
