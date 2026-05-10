package com.appia.controller;

import com.appia.model.NetworkNode;
import com.appia.repository.NetworkNodeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Appia — Topology Controller
 * Exposes the network graph (nodes + links) for the frontend NetworkMap.
 * Links are computed from the node list — each pair of ONLINE nodes has a link
 * with latency derived from their processing latencies and geographic distance.
 *
 * GET /api/v1/topology/links → list of {source, target, latency_ms, active, bandwidth_gbps}
 */
@RestController
@RequestMapping("/api/v1/topology")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class TopologyController {

    private final NetworkNodeRepository nodeRepo;

    // Pre-defined backbone links (source → target) reflecting real submarine/terrestrial cables
    // Latency approximated from geographic distance + propagation speed
    private static final int[][] LINK_PAIRS = {
        // {sourceIdx, targetIdx, base_latency_ms, bandwidth_gbps}
        // Oslo ↔ Copenhagen (terrestrial, 521km)
        {0, 1, 5,  100},
        // Oslo ↔ Frankfurt (terrestrial, 1380km)
        {0, 3, 12, 100},
        // Copenhagen ↔ Frankfurt (terrestrial, 889km)
        {1, 3, 8,  100},
        // Copenhagen ↔ Milan (terrestrial, 1470km)
        {1, 2, 14, 40},
        // Frankfurt ↔ Milan (terrestrial, 860km)
        {3, 2, 8,  100},
        // Milan ↔ Addis Ababa (submarine cable via Red Sea, ~5800km)
        {2, 4, 58, 10},
        // Frankfurt ↔ Addis Ababa (via submarine, ~6700km)
        {3, 4, 65, 10},
    };

    @GetMapping("/links")
    public ResponseEntity<List<Map<String, Object>>> getLinks() {
        List<NetworkNode> nodes = nodeRepo.findAll();
        // Sort consistently by nodeId so indices match LINK_PAIRS
        nodes.sort(Comparator.comparing(NetworkNode::getNodeId));

        List<Map<String, Object>> links = new ArrayList<>();
        for (int[] pair : LINK_PAIRS) {
            if (pair[0] >= nodes.size() || pair[1] >= nodes.size()) continue;
            NetworkNode src = nodes.get(pair[0]);
            NetworkNode tgt = nodes.get(pair[1]);

            // Link is active only if both endpoints are ONLINE
            boolean active = src.getStatus() == NetworkNode.NodeStatus.ONLINE
                          && tgt.getStatus() == NetworkNode.NodeStatus.ONLINE;

            // Effective latency = base propagation + source processing + target processing
            double effectiveLatency = pair[2]
                + src.getProcessingLatencyMs()
                + tgt.getProcessingLatencyMs();

            Map<String, Object> link = new HashMap<>();
            link.put("from",           src.getNodeId());   // matches NetworkMap prop (link.from)
            link.put("to",             tgt.getNodeId());   // matches NetworkMap prop (link.to)
            link.put("source",         src.getNodeId());   // keep for graph clients
            link.put("target",         tgt.getNodeId());   // keep for graph clients
            link.put("base_latency_ms",pair[2]);
            link.put("latency_ms",     Math.round(effectiveLatency * 10.0) / 10.0);
            link.put("bandwidth_gbps", pair[3]);
            link.put("active",         active);
            // Carbon cost of using this link (avg of both endpoints)
            link.put("avg_carbon",     Math.round(
                (src.getCarbonIntensityGco2Kwh() + tgt.getCarbonIntensityGco2Kwh()) / 2.0));
            links.add(link);
        }
        return ResponseEntity.ok(links);
    }

    @GetMapping("/graph")
    public ResponseEntity<Map<String, Object>> getG