"""
Appia — Network Node Model
Represents a physical network site (Edge node, Data Center, Core Hub).
Each node has energy sources, compute capacity, and real-time telemetry.
"""

from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum

from .energy_profile import (
    EnergySource, EnergySourceType, EnergyProfileSimulator,
    create_oslo_profile, create_copenhagen_profile,
    create_milan_profile, create_frankfurt_profile, create_addis_profile,
)


class NodeType(Enum):
    EDGE = "edge"           # Low-latency, close to users
    CORE = "core"           # High-capacity backbone node
    DATA_CENTER = "dc"      # Large compute/storage hub


class NodeStatus(Enum):
    ONLINE = "online"
    DEGRADED = "degraded"   # Running on battery/backup
    OFFLINE = "offline"


@dataclass
class NetworkNode:
    """
    A physical network site in the Appia simulation.
    Tracks energy state, compute load, and SLA compliance.
    """
    node_id: str
    name: str
    location: str                       # Country code: NO, DK, IT, DE, ET
    node_type: NodeType
    energy_sources: List[EnergySource]

    # Compute specs
    cpu_capacity: float                 # Total CPU cores
    memory_capacity_gb: float          # Total RAM in GB
    max_bandwidth_gbps: float          # Network bandwidth

    # Current state
    cpu_load: float = 0.0              # 0.0 to 1.0
    memory_load: float = 0.0          # 0.0 to 1.0
    bandwidth_load: float = 0.0       # 0.0 to 1.0
    status: NodeStatus = NodeStatus.ONLINE
    latency_ms: float = 5.0           # Internal processing latency

    # Location coordinates (for dashboard map)
    latitude: float = 0.0
    longitude: float = 0.0

    # Simulation state
    current_hour: float = 12.0
    season: str = "summer"

    def __post_init__(self):
        self._simulator = EnergyProfileSimulator()

    # ── Energy Methods ────────────────────────────────────────────────────────

    def update_energy_state(self, hour: float):
        """Update all energy sources based on time of day."""
        self.current_hour = hour
        for source in self.energy_sources:
            if source.source_type == EnergySourceType.SOLAR:
                source.availability = self._simulator.solar_availability(hour, self.season)
            elif source.source_type == EnergySourceType.WIND:
                source.availability = self._simulator.wind_availability(hour)
            elif source.source_type == EnergySourceType.GRID:
                source.carbon_intensity = self._simulator.grid_carbon_intensity(hour, self.location)
                source.cost_per_kwh = self._simulator.grid_price(hour, self.location)
            # Battery and Backup availability is managed by resilience logic

    def total_available_power_kw(self) -> float:
        """Total power available from all active sources."""
        return sum(s.current_power_kw() for s in self.energy_sources if s.availability > 0)

    def current_carbon_intensity(self) -> float:
        """
        Weighted average carbon intensity of active energy mix.
        Lower = greener. In gCO2/kWh.
        """
        total_power = self.total_available_power_kw()
        if total_power == 0:
            return 999.0  # Node is dark
        weighted_carbon = sum(
            s.current_power_kw() * s.carbon_intensity
            for s in self.energy_sources if s.availability > 0
        )
        return weighted_carbon / total_power

    def current_energy_cost(self) -> float:
        """
        Weighted average energy cost in €/kWh from active mix.
        """
        total_power = self.total_available_power_kw()
        if total_power == 0:
            return 999.0
        weighted_cost = sum(
            s.current_power_kw() * s.cost_per_kwh
            for s in self.energy_sources if s.availability > 0
        )
        return weighted_cost / total_power

    def battery_level(self) -> float:
        """Returns battery level (0.0–1.0) or -1 if no battery."""
        for source in self.energy_sources:
            if source.source_type == EnergySourceType.BATTERY:
                return source.battery_level
        return -1.0

    def activate_backup(self):
        """Activate diesel generator when all else fails."""
        for source in self.energy_sources:
            if source.source_type == EnergySourceType.BACKUP:
                source.availability = 1.0
                self.status = NodeStatus.DEGRADED

    def deactivate_backup(self):
        """Turn off backup generator when renewable/grid is available."""
        for source in self.energy_sources:
            if source.source_type == EnergySourceType.BACKUP:
                source.availability = 0.0

    # ── Compute Methods ───────────────────────────────────────────────────────

    def available_cpu(self) -> float:
        """Available CPU cores."""
        return self.cpu_capacity * (1.0 - self.cpu_load)

    def available_memory_gb(self) -> float:
        """Available memory in GB."""
        return self.memory_capacity_gb * (1.0 - self.memory_load)

    def can_host(self, cpu_req: float, memory_req_gb: float, bandwidth_req_gbps: float) -> bool:
        """Check if node can accept a new VNF/SFC placement."""
        if self.status == NodeStatus.OFFLINE:
            return False
        return (
            self.available_cpu() >= cpu_req
            and self.available_memory_gb() >= memory_req_gb
            and (self.max_bandwidth_gbps * (1.0 - self.bandwidth_load)) >= bandwidth_req_gbps
        )

    def place_workload(self, cpu_req: float, memory_req_gb: float, bandwidth_req_gbps: float):
        """Add a workload to this node."""
        self.cpu_load = min(1.0, self.cpu_load + cpu_req / self.cpu_capacity)
        self.memory_load = min(1.0, self.memory_load + memory_req_gb / self.memory_capacity_gb)
        self.bandwidth_load = min(1.0, self.bandwidth_load + bandwidth_req_gbps / self.max_bandwidth_gbps)

    def remove_workload(self, cpu_req: float, memory_req_gb: float, bandwidth_req_gbps: float):
        """Remove a workload from this node."""
        self.cpu_load = max(0.0, self.cpu_load - cpu_req / self.cpu_capacity)
        self.memory_load = max(0.0, self.memory_load - memory_req_gb / self.memory_capacity_gb)
        self.bandwidth_load = max(0.0, self.bandwidth_load - bandwidth_req_gbps / self.max_bandwidth_gbps)

    def reset_load(self):
        """Clear all workloads from this node."""
        self.cpu_load = 0.0
        self.memory_load = 0.0
        self.bandwidth_load = 0.0

    # ── Status & Observation ─────────────────────────────────────────────────

    def get_observation(self) -> dict:
        """Return current node state as a flat dict for the RL environment."""
        return {
            "node_id": self.node_id,
            "carbon_intensity": self.current_carbon_intensity(),
            "energy_cost": self.current_energy_cost(),
            "available_power_kw": self.total_available_power_kw(),
            "battery_level": max(0.0, self.battery_level()),
            "cpu_load": self.cpu_load,
            "memory_load": self.memory_load,
            "bandwidth_load": self.bandwidth_load,
            "latency_ms": self.latency_ms,
            "status": self.status.value,
        }

    def __repr__(self):
        return (
            f"Node({self.node_id} | {self.name} | {self.status.value} | "
            f"Carbon: {self.current_carbon_intensity():.1f} gCO2/kWh | "
            f"Cost: €{self.current_energy_cost():.3f}/kWh | "
            f"CPU: {self.cpu_load*100:.1f}%)"
        )


# ── Factory: Build the 5 Appia Network Sites ─────────────────────────────────

def create_appia_network() -> List[NetworkNode]:
    """
    Creates the 5 default Appia network sites.
    These represent the real-world topology the RL agent will optimize.
    """
    nodes = [
        NetworkNode(
            node_id="NO-OSLO-01",
            name="Oslo Edge Node",
            location="NO",
            node_type=NodeType.EDGE,
            energy_sources=create_oslo_profile(),
            cpu_capacity=64,
            memory_capacity_gb=256,
            max_bandwidth_gbps=10.0,
            latency_ms=3.0,
            latitude=59.9139,
            longitude=10.7522,
        ),
        NetworkNode(
            node_id="DK-CPH-01",
            name="Copenhagen Core",
            location="DK",
            node_type=NodeType.CORE,
            energy_sources=create_copenhagen_profile(),
            cpu_capacity=128,
            memory_capacity_gb=512,
            max_bandwidth_gbps=40.0,
            latency_ms=2.0,
            latitude=55.6761,
            longitude=12.5683,
        ),
        NetworkNode(
            node_id="IT-MIL-01",
            name="Milan Data Center",
            location="IT",
            node_type=NodeType.DATA_CENTER,
            energy_sources=create_milan_profile(),
            cpu_capacity=256,
            memory_capacity_gb=1024,
            max_bandwidth_gbps=100.0,
            latency_ms=1.5,
            latitude=45.4642,
            longitude=9.1900,
        ),
        NetworkNode(
            node_id="DE-FRA-01",
            name="Frankfurt Hub",
            location="DE",
            node_type=NodeType.DATA_CENTER,
            energy_sources=create_frankfurt_profile(),
            cpu_capacity=512,
            memory_capacity_gb=2048,
            max_bandwidth_gbps=200.0,
            latency_ms=1.0,
            latitude=50.1109,
            longitude=8.6821,
        ),
        NetworkNode(
            node_id="ET-ADD-01",
            name="Addis Ababa Edge",
            location="ET",
            node_type=NodeType.EDGE,
            energy_sources=create_addis_profile(),
            cpu_capacity=32,
            memory_capacity_gb=128,
            max_bandwidth_gbps=2.0,
            latency_ms=15.0,
            latitude=9.0320,
            longitude=38.7469,
        ),
    ]
    return nodes
