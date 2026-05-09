"""
Appia — Service Function Chain (SFC) Model
Defines the virtual network services that need to be placed on nodes.
Three priority tiers: CRITICAL, MEDIUM, LOW — aligned with real Telco/EU standards.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class SFCPriority(Enum):
    """
    Priority tiers based on EU NIS2 Directive and Telco QoS standards.
    CRITICAL: Must run at all costs (Banking, Health, Emergency)
    MEDIUM:   Business-critical but tolerates brief degradation
    LOW:      Best-effort services that can be shed during power emergency
    """
    CRITICAL = 3
    MEDIUM = 2
    LOW = 1


class SFCStatus(Enum):
    RUNNING = "running"
    MIGRATING = "migrating"
    DEGRADED = "degraded"
    SHED = "shed"           # Intentionally paused to save energy/battery


@dataclass
class SFC:
    """
    A Service Function Chain — a virtual workload that needs to be placed on a node.
    Examples: Banking API, Video Streaming, Emergency Comms, etc.
    """
    sfc_id: str
    name: str
    priority: SFCPriority
    description: str

    # Resource requirements
    cpu_req: float          # CPU cores needed
    memory_req_gb: float    # RAM needed
    bandwidth_req_gbps: float  # Network bandwidth needed

    # SLA constraints
    max_latency_ms: float   # Maximum acceptable latency
    min_availability: float  # Required uptime (0.0–1.0), e.g. 0.999 = 99.9%

    # Current state
    status: SFCStatus = SFCStatus.RUNNING
    assigned_node_id: Optional[str] = None
    current_latency_ms: float = 0.0
    sla_violations: int = 0

    # Tracking
    total_steps: int = 0
    running_steps: int = 0

    def is_sla_met(self) -> bool:
        """Check if current placement meets SLA requirements."""
        if self.status == SFCStatus.SHED:
            return self.priority != SFCPriority.CRITICAL  # Critical SFCs must never be shed
        if self.assigned_node_id is None:
            return False
        return self.current_latency_ms <= self.max_latency_ms

    def availability_score(self) -> float:
        """Historical availability ratio."""
        if self.total_steps == 0:
            return 1.0
        return self.running_steps / self.total_steps

    def can_be_shed(self) -> bool:
        """LOW priority services can be shed during power emergencies."""
        return self.priority == SFCPriority.LOW

    def tick(self):
        """Advance one simulation timestep."""
        self.total_steps += 1
        if self.status == SFCStatus.RUNNING:
            self.running_steps += 1
        if not self.is_sla_met():
            self.sla_violations += 1

    def get_observation(self) -> dict:
        """Return SFC state for the RL observation."""
        return {
            "sfc_id": self.sfc_id,
            "priority": self.priority.value,
            "cpu_req": self.cpu_req,
            "memory_req_gb": self.memory_req_gb,
            "bandwidth_req_gbps": self.bandwidth_req_gbps,
            "max_latency_ms": self.max_latency_ms,
            "status": self.status.value,
            "assigned_node_id": self.assigned_node_id or "none",
            "current_latency_ms": self.current_latency_ms,
            "sla_met": float(self.is_sla_met()),
        }

    def __repr__(self):
        return (
            f"SFC({self.sfc_id} | {self.name} | {self.priority.name} | "
            f"Node: {self.assigned_node_id or 'UNPLACED'} | "
            f"SLA: {'OK' if self.is_sla_met() else 'VIOLATED'})"
        )


# ── Factory: Default SFC Catalogue ───────────────────────────────────────────

def create_default_sfcs() -> list:
    """
    8 SFCs representing a realistic Telco/Banking service catalogue.
    Matches real EU market use cases.
    """
    return [
        # ── CRITICAL: Must run 24/7, cannot be shed ───────────────────────
        SFC(
            sfc_id="SFC-BANK-01",
            name="Banking Core API",
            priority=SFCPriority.CRITICAL,
            description="Real-time payment processing and account management",
            cpu_req=8.0,
            memory_req_gb=32.0,
            bandwidth_req_gbps=1.0,
            max_latency_ms=10.0,
            min_availability=0.9999,  # 99.99% uptime
        ),
        SFC(
            sfc_id="SFC-HEALTH-01",
            name="eHealth Emergency Comms",
            priority=SFCPriority.CRITICAL,
            description="Hospital patient monitoring and emergency dispatch",
            cpu_req=4.0,
            memory_req_gb=16.0,
            bandwidth_req_gbps=0.5,
            max_latency_ms=5.0,
            min_availability=0.9999,
        ),
        SFC(
            sfc_id="SFC-EMERG-01",
            name="Emergency Services Network",
            priority=SFCPriority.CRITICAL,
            description="Police, fire brigade, ambulance communications",
            cpu_req=4.0,
            memory_req_gb=16.0,
            bandwidth_req_gbps=0.5,
            max_latency_ms=5.0,
            min_availability=0.99999,  # 99.999% — five nines
        ),

        # ── MEDIUM: Business-critical, tolerates brief degradation ────────
        SFC(
            sfc_id="SFC-CORP-01",
            name="Corporate VPN Gateway",
            priority=SFCPriority.MEDIUM,
            description="Enterprise remote access and VPN termination",
            cpu_req=6.0,
            memory_req_gb=24.0,
            bandwidth_req_gbps=2.0,
            max_latency_ms=50.0,
            min_availability=0.999,
        ),
        SFC(
            sfc_id="SFC-IOT-01",
            name="Smart Grid IoT Hub",
            priority=SFCPriority.MEDIUM,
            description="EU smart grid sensor data aggregation (Green Deal)",
            cpu_req=4.0,
            memory_req_gb=16.0,
            bandwidth_req_gbps=1.0,
            max_latency_ms=100.0,
            min_availability=0.99,
        ),
        SFC(
            sfc_id="SFC-CDN-01",
            name="Content Delivery Network",
            priority=SFCPriority.MEDIUM,
            description="Static content and web acceleration",
            cpu_req=8.0,
            memory_req_gb=32.0,
            bandwidth_req_gbps=5.0,
            max_latency_ms=80.0,
            min_availability=0.99,
        ),

        # ── LOW: Best-effort — shed first during power emergency ──────────
        SFC(
            sfc_id="SFC-STREAM-01",
            name="Video Streaming",
            priority=SFCPriority.LOW,
            description="OTT video streaming platform (Netflix-like)",
            cpu_req=16.0,
            memory_req_gb=64.0,
            bandwidth_req_gbps=10.0,
            max_latency_ms=500.0,
            min_availability=0.95,
        ),
        SFC(
            sfc_id="SFC-SOCIAL-01",
            name="Social Media Cache",
            priority=SFCPriority.LOW,
            description="Social network content caching and delivery",
            cpu_req=12.0,
            memory_req_gb=48.0,
            bandwidth_req_gbps=8.0,
            max_latency_ms=300.0,
            min_availability=0.95,
        ),
    ]
