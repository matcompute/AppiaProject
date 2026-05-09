"""
Appia — FastAPI Simulation Bridge
Connects the Python RL simulation to the React frontend.
Provides REST endpoints + Server-Sent Events (SSE) for real-time updates.

Run: uvicorn backend_api.main:app --port 8004 --reload
"""

import sys
import os
import asyncio
import json
from typing import AsyncGenerator

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from simulation.environment.node import create_appia_network
from simulation.environment.sfc import create_default_sfcs, SFCStatus

# ── App setup ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Appia Simulation API",
    description="AI Digital Twin for Green Network Infrastructure",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global simulation state ────────────────────────────────────────────────────
class SimState:
    def __init__(self):
        self.nodes = create_appia_network()
        self.sfcs = create_default_sfcs()
        self.hour = 9.0
        self.step = 0
        self.running = False

    def tick(self):
        self.hour = (self.hour + 1) % 24
        for node in self.nodes:
            node.update_energy_state(self.hour)
        self.step += 1

    def to_dict(self):
        node_map = {n.node_id: n for n in self.nodes}
        return {
            "hour": self.hour,
            "step": self.step,
            "nodes": [
                {
                    "node_id": n.node_id,
                    "name": n.name,
                    "location": n.location,
                    "type": n.node_type.value,
                    "carbon_intensity": round(n.current_carbon_intensity(), 1),
                    "energy_cost": round(n.current_energy_cost(), 4),
                    "available_power_kw": round(n.total_available_power_kw(), 1),
                    "battery_level": round(max(n.battery_level(), -1), 2),
                    "cpu_load": round(n.cpu_load, 3),
                    "memory_load": round(n.memory_load, 3),
                    "bandwidth_load": round(n.bandwidth_load, 3),
                    "latency_ms": n.latency_ms,
                    "status": n.status.value,
                }
                for n in self.nodes
            ],
            "sfcs": [
                {
                    "sfc_id": s.sfc_id,
                    "name": s.name,
                    "priority": s.priority.name,
                    "status": s.status.value,
                    "assigned_node": s.assigned_node_id,
                    "latency_ms": s.current_latency_ms,
                    "sla_ok": s.is_sla_met(),
                    "cpu_req": s.cpu_req,
                    "max_latency": s.max_latency_ms,
                }
                for s in self.sfcs
            ],
        }


sim = SimState()

# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "online", "project": "Appia", "version": "0.1.0"}


@app.get("/state")
def get_state():
    """Current simulation state snapshot."""
    return sim.to_dict()


@app.post("/step")
def step_simulation():
    """Advance simulation by 1 hour."""
    sim.tick()
    return sim.to_dict()


@app.post("/reset")
def reset_simulation():
    """Reset simulation to initial state."""
    global sim
    sim = SimState()
    return {"status": "reset", "hour": sim.hour}


@app.get("/nodes/{node_id}")
def get_node(node_id: str):
    """Get detailed state of a specific node."""
    node = next((n for n in sim.nodes if n.node_id == node_id), None)
    if not node:
        return {"error": "Node not found"}
    return node.get_observation()


@app.get("/events")
async def event_stream():
    """
    Server-Sent Events stream — pushes real-time simulation updates to the frontend.
    The React dashboard subscribes to this for live data.
    """
    async def generate() -> AsyncGenerator[str, None]:
        while True:
            sim.tick()
            data = json.dumps(sim.to_dict())
            yield f"data: {data}\n\n"
            await asyncio.sleep(2.0)  # 1 simulated hour every 2 seconds

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "simulation_step": sim.step,
        "current_hour": sim.hour,
        "nodes": len(sim.nodes),
        "sfcs": len(sim.sfcs),
    }
