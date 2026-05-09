"""
Appia — Lightweight Live Orchestrator
======================================
Reads LIVE state from Spring Boot, applies agent logic, pushes decisions back.
No gymnasium / torch / SB3 required — just requests + numpy.

This is actually the REAL Phase 5 architecture:
  Spring Boot DB → Agent reads state → Agent decides → Spring Boot DB updated
  → React dashboard shows live topology changes

Usage:
  python live_orchestrator.py --agent greedy
  python live_orchestrator.py --agent random
  python live_orchestrator.py --agent compare
"""

import argparse
import time
import random
import math
import sys

try:
    import requests
except ImportError:
    print("[ERROR] Run: pip install requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
BACKEND      = "http://localhost:8080/api/v1"
TICK_SECONDS = 3.0   # seconds between decisions

# Priority weights for scoring (matches the RL reward weights)
W_CARBON  = 0.30
W_COST    = 0.20
W_SLA     = 0.35
W_RESIL   = 0.15

# ── Backend helpers ───────────────────────────────────────────────────────────

def get_nodes():
    r = requests.get(f"{BACKEND}/nodes", timeout=5)
    r.raise_for_status()
    return r.json()

def get_sfcs():
    r = requests.get(f"{BACKEND}/sfcs", timeout=5)
    r.raise_for_status()
    return r.json()

def place_sfc(sfc_id, node_id, reward, decision_maker):
    requests.post(f"{BACKEND}/sfcs/{sfc_id}/place", json={
        "node_id": node_id,
        "reward": round(reward, 4),
        "decision_maker": decision_maker,
    }, timeout=3)

def shed_sfc(sfc_id):
    requests.post(f"{BACKEND}/sfcs/{sfc_id}/shed", timeout=3)

def push_telemetry(node_id, carbon, cost, battery, cpu, memory):
    requests.patch(f"{BACKEND}/nodes/{node_id}/telemetry", json={
        "carbon_intensity": round(carbon, 2),
        "energy_cost":      round(cost, 5),
        "battery_level":    round(battery, 1),
        "cpu_load":         round(cpu, 1),
        "memory_load":      round(memory, 1),
    }, timeout=3)

def check_backend():
    try:
        r = requests.get(f"{BACKEND}/nodes", timeout=5)
        nodes = r.json()
        print(f"  [OK] Connected — {len(nodes)} nodes, Spring Boot is live")
        return True
    except Exception as e:
        print(f"  [FAIL] Cannot reach {BACKEND}: {e}")
        return False

# ── Simulation helpers (lightweight energy simulation) ────────────────────────

_hour = 9.0
_node_state = {}   # node_id → {carbon, cost, battery, cpu, memory}

def init_node_state(nodes):
    global _node_state
    for n in nodes:
        _node_state[n["nodeId"]] = {
            "carbon":  n.get("carbonIntensityGco2Kwh", 200),
            "cost":    n.get("energyCostEurKwh", 0.15),
            "battery": n.get("batteryLevelPct", -1),
            "cpu":     n.get("cpuLoadPct", 0),
            "memory":  n.get("memoryLoadPct", 0),
        }

BASE_CARBON = {"NO-OSLO-01": 25,  "DK-CPH-01": 120, "IT-MIL-01": 280,
               "DE-FRA-01": 320,  "ET-ADD-01": 30}
BASE_COST   = {"NO-OSLO-01": 0.04,"DK-CPH-01": 0.12,"IT-MIL-01": 0.22,
               "DE-FRA-01": 0.18, "ET-ADD-01": 0.05}

def solar(h):
    if h < 6 or h > 20: return 0
    return max(0, 0.95 * math.exp(-((h-13)**2)/50) + (random.random()-0.5)*0.05)

def wind(h):
    return max(0.05, 0.55 + 0.15*math.sin(2*math.pi*(h-14)/24) + (random.random()-0.5)*0.12)

def tick_node_state(node_id, h):
    """Advance energy simulation by 1 hour for one node."""
    bc = BASE_CARBON.get(node_id, 200)
    bp = BASE_COST.get(node_id, 0.15)
    peak = 1.25 if (8<=h<=10 or 18<=h<=20) else (0.75 if h<=5 else 1.0)

    carbon = bc * peak + (random.random()-0.5) * bc * 0.05
    cost   = bp * peak + (random.random()-0.5) * 0.005
    batt   = _node_state[node_id]["battery"]

    if node_id == "NO-OSLO-01":
        s = solar(h)
        carbon = carbon * (1 - s*0.4)
        cost   = cost   * (1 - s*0.2)
    if node_id == "DK-CPH-01":
        w = wind(h)
        carbon = carbon * (1 - w*0.5)
        cost   = cost   * (1 - w*0.3)
    if node_id == "ET-ADD-01" and batt >= 0:
        s = solar(h)
        batt = min(100, batt + 4) if s > 0.1 else max(5, batt - 2)
        carbon = 8 + random.random()*5 if s > 0.3 else 180 + random.random()*30

    cpu    = max(0, min(100, _node_state[node_id]["cpu"]    + (random.random()-0.5)*4))
    memory = max(0, min(100, _node_state[node_id]["memory"] + (random.random()-0.5)*2))

    _node_state[node_id] = {
        "carbon":  max(5, carbon),
        "cost":    max(0.005, cost),
        "battery": batt,
        "cpu":     cpu,
        "memory":  memory,
    }
    return _node_state[node_id]

# ── Agent logic ───────────────────────────────────────────────────────────────

def score_node(node_id):
    """Lower score = better placement (greedy multi-objective)."""
    s = _node_state.get(node_id, {})
    carbon_norm = s.get("carbon", 300) / 700.0
    cost_norm   = s.get("cost", 0.2)   / 0.4
    cpu_norm    = s.get("cpu", 50)     / 100.0
    return W_CARBON * carbon_norm + W_COST * cost_norm + W_SLA * cpu_norm

def greedy_decide(sfcs, nodes):
    """Place each SFC on the node with the lowest multi-objective score."""
    node_ids = [n["nodeId"] for n in nodes]
    decisions = {}
    for sfc in sfcs:
        priority = sfc.get("priority", "LOW")
        if priority == "CRITICAL":
            # Critical SFCs: exclude highest-carbon nodes
            candidates = sorted(node_ids, key=score_node)
        else:
            candidates = sorted(node_ids, key=score_node)
        decisions[sfc["id"]] = candidates[0]
    return decisions

def random_decide(sfcs, nodes):
    """Randomly assign SFCs to nodes."""
    node_ids = [n["nodeId"] for n in nodes]
    return {sfc["id"]: random.choice(node_ids) for sfc in sfcs}

def compute_reward(sfcs, decisions):
    """Estimate reward based on placements."""
    total = 0
    for sfc in sfcs:
        node_id = decisions.get(sfc["id"])
        if not node_id:
            continue
        s = _node_state.get(node_id, {})
        carbon_pen = (s.get("carbon", 300) / 700.0) * W_CARBON
        cost_pen   = (s.get("cost", 0.2)   / 0.40)  * W_COST
        sla_bonus  = W_SLA * (1.0 if sfc.get("priority") == "CRITICAL" else 0.5)
        total += sla_bonus - carbon_pen - cost_pen
    return total / max(len(sfcs), 1)

# ── Stats tracking ────────────────────────────────────────────────────────────

class Stats:
    def __init__(self, name):
        self.name = name
        self.steps = 0
        self.total_reward = 0
        self.total_carbon = 0
        self.total_cost   = 0

    def update(self, reward, nodes_state):
        self.steps        += 1
        self.total_reward += reward
        self.total_carbon += sum(s["carbon"] for s in nodes_state.values()) / len(nodes_state)
        self.total_cost   += sum(s["cost"]   for s in nodes_state.values()) / len(nodes_state)

    def summary(self):
        n = max(self.steps, 1)
        return (f"{self.name.upper():<12} "
                f"Avg Reward: {self.total_reward/n:+.4f}  "
                f"Avg Carbon: {self.total_carbon/n:5.1f} gCO2/kWh  "
                f"Avg Cost: €{self.total_cost/n:.5f}")

# ── Main loop ─────────────────────────────────────────────────────────────────

def run(agent_name, compare=False):
    global _hour

    print(f"\n  Fetching initial state from Spring Boot...")
    nodes = get_nodes()
    sfcs  = get_sfcs()
    init_node_state(nodes)

    stats_map = {}
    if compare:
        for name in ["greedy", "random"]:
            stats_map[name] = Stats(name)
    else:
        stats_map[agent_name] = Stats(agent_name)

    dm_map = {"greedy": "GREEDY_ENERGY", "random": "RANDOM"}

    print(f"  Agent: {agent_name.upper()}{' + RANDOM (compare)' if compare else ''}")
    print(f"  Tick interval: {TICK_SECONDS}s | Ctrl+C to stop\n")
    print(f"{'─'*72}")

    step = 0
    try:
        while True:
            _hour = (_hour + 1) % 24

            # Tick energy simulation for all nodes and push telemetry
            for n in nodes:
                nid   = n["nodeId"]
                state = tick_node_state(nid, _hour)
                try:
                    push_telemetry(nid,
                        state["carbon"], state["cost"],
                        state["battery"], state["cpu"], state["memory"])
                except Exception:
                    pass

            # Refresh SFC list from backend
            try:
                sfcs = get_sfcs()
            except Exception:
                pass

            # Run agents
            agents_to_run = (["greedy", "random"] if compare
                             else [agent_name])

            for ag in agents_to_run:
                decide_fn = greedy_decide if ag == "greedy" else random_decide
                decisions  = decide_fn(sfcs, nodes)
                reward     = compute_reward(sfcs, decisions)

                # Push to Spring Boot (only the primary/greedy agent in compare mode)
                if ag == agents_to_run[0]:
                    for sfc in sfcs:
                        sfc_id  = sfc["id"]
                        node_id = decisions.get(sfc_id)
                        if node_id:
                            try:
                                place_sfc(sfc_id, node_id, reward, dm_map[ag])
                            except Exception:
                                pass

                stats_map[ag].update(reward, _node_state)

                sla_ok = sum(1 for s in sfcs if not s.get("slaViolated", False))
                print(f"  [{ag.upper():7s}] "
                      f"Step {step:4d} | Hour {int(_hour):02d}:00 | "
                      f"Reward: {reward:+.4f} | "
                      f"SLA {sla_ok}/{len(sfcs)} | "
                      f"Carbon: {_node_state.get('NO-OSLO-01',{}).get('carbon',0):5.1f}→"
                      f"{_node_state.get('IT-MIL-01',{}).get('carbon',0):5.1f} gCO2")

            if compare and (step+1) % 10 == 0:
                print(f"\n  {'─'*68}")
                print(f"  BENCHMARK TABLE (step {step+1})")
                print(f"  {'─'*68}")
                for s in stats_map.values():
                    print(f"  {s.summary()}")
                print(f"  {'─'*68}\n")

            step += 1
            time.sleep(TICK_SECONDS)

    except KeyboardInterrupt:
        print(f"\n\n  Stopped after {step} steps.")
        if compare:
            print(f"\n  FINAL BENCHMARK:")
            print(f"  {'─'*68}")
            for s in stats_map.values():
                print(f"  {s.summary()}")
            print(f"  {'─'*68}")

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Appia Live Orchestrator")
    parser.add_argument("--agent",    choices=["greedy","random","compare"], default="greedy")
    parser.add_argument("--interval", type=float, default=TICK_SECONDS)
    args = parser.parse_args()
    TICK_SECONDS = args.interval

    print("\n" + "="*72)
    print("  APPIA Live Orchestrator — Spring Boot Edition")
    print("  Agent decisions → Spring Boot DB → React Dashboard (live)")
    print("="*72)
    print("\n  Checking Spring Boot backend...")

    if not check_backend():
        print("  Start Spring Boot first:  cd backend && run.bat")
        sys.exit(1)

    run(args.agent, compare=(args.agent == "compare"))
