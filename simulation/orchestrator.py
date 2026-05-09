"""
Appia — Live RL Orchestrator (Phase 5)
======================================
Connects the Python RL agent to the Spring Boot backend in real time.

Every tick:
  1. Agent observes current network state
  2. Agent decides where to place each SFC (PPO / Greedy / Random)
  3. Placement decisions → POST /api/v1/sfcs/{id}/place
  4. Node telemetry → PATCH /api/v1/nodes/{id}/telemetry
  5. React dashboard polls Spring Boot and shows live topology

Usage:
  python -m simulation.orchestrator --agent ppo       # PPO agent (default)
  python -m simulation.orchestrator --agent greedy    # Greedy energy baseline
  python -m simulation.orchestrator --agent random    # Random baseline
  python -m simulation.orchestrator --agent compare   # Run all 3, print comparison table

Author: Appia Research Team
"""

import argparse
import time
import sys
import os
import numpy as np
from copy import deepcopy

try:
    import requests
except ImportError:
    print("[ERROR] 'requests' not installed. Run: pip install requests")
    sys.exit(1)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from simulation.environment.network_env import AppiaNetworkEnv
from simulation.agents.ppo_agent import AppiaAgent, RandomAgent, GreedyEnergyAgent

# ── Configuration ─────────────────────────────────────────────────────────────
BACKEND_URL  = "http://localhost:8080"
TICK_INTERVAL = 3.0   # seconds between ticks (3s = 1 simulated hour)

# Positional mapping: sim index → Spring Boot SFC ID
# Sim:   BANK(0), HEALTH(1), EMERG(2), CORP(3), IOT(4),   CDN(5), STREAM(6), SOCIAL(7)
# Boot:  BANK(0), HEALTH(1), EMERG(2), CORP(3), 5G-UPF(4),CDN(5), STREAM(6), SOCIAL(7)
SFC_IDS = [
    "SFC-BANK-01",
    "SFC-HEALTH-01",
    "SFC-EMERG-01",
    "SFC-CORP-01",
    "SFC-5G-UPF-01",
    "SFC-CDN-01",
    "SFC-STREAM-01",
    "SFC-SOCIAL-01",
]

# Node index → Spring Boot node ID (matches sim order exactly)
NODE_IDS = [
    "NO-OSLO-01",
    "DK-CPH-01",
    "IT-MIL-01",
    "DE-FRA-01",
    "ET-ADD-01",
]

# ── Backend client ────────────────────────────────────────────────────────────

def check_backend():
    """Verify Spring Boot is reachable before starting."""
    try:
        r = requests.get(f"{BACKEND_URL}/api/v1/nodes", timeout=5)
        if r.status_code == 200:
            nodes = r.json()
            print(f"  [OK] Spring Boot connected — {len(nodes)} nodes found")
            return True
    except Exception as e:
        print(f"  [FAIL] Cannot reach Spring Boot at {BACKEND_URL}: {e}")
        return False

def push_telemetry(env: AppiaNetworkEnv):
    """Push current node energy/load state to Spring Boot."""
    for i, node in enumerate(env.nodes):
        node_id = NODE_IDS[i]
        payload = {
            "carbon_intensity": round(node.current_carbon_intensity(), 2),
            "energy_cost":      round(node.current_energy_cost(), 5),
            "battery_level":    round(node.battery_level() * 100, 1),  # 0-1 → 0-100
            "cpu_load":         round(node.cpu_load * 100, 1),          # 0-1 → 0-100
            "memory_load":      round(node.memory_load * 100, 1),
        }
        try:
            requests.patch(
                f"{BACKEND_URL}/api/v1/nodes/{node_id}/telemetry",
                json=payload,
                timeout=3,
            )
        except Exception as e:
            print(f"  [WARN] Telemetry push failed for {node_id}: {e}")

def push_placements(env: AppiaNetworkEnv, action: np.ndarray,
                    reward: float, agent_name: str):
    """Push SFC placement decisions to Spring Boot."""
    n_nodes = len(env.nodes)
    dm_map = {
        "ppo":    "PPO_AGENT",
        "greedy": "GREEDY_ENERGY",
        "random": "RANDOM",
    }
    dm = dm_map.get(agent_name, "PPO_AGENT")

    for i, sfc in enumerate(env.sfcs):
        node_idx = int(action[i])
        sfc_id   = SFC_IDS[i]

        if node_idx == n_nodes:
            # SHED action — call shed endpoint
            try:
                requests.post(
                    f"{BACKEND_URL}/api/v1/sfcs/{sfc_id}/shed",
                    timeout=3,
                )
            except Exception as e:
                print(f"  [WARN] Shed failed for {sfc_id}: {e}")
        else:
            node_id = NODE_IDS[node_idx]
            try:
                requests.post(
                    f"{BACKEND_URL}/api/v1/sfcs/{sfc_id}/place",
                    json={
                        "node_id":       node_id,
                        "reward":        round(float(reward), 4),
                        "decision_maker": dm,
                    },
                    timeout=3,
                )
            except Exception as e:
                print(f"  [WARN] Placement failed for {sfc_id}: {e}")

# ── Metrics display ───────────────────────────────────────────────────────────

def print_tick(step, hour, reward, info, agent_name):
    sla_v    = info.get("sla_violations", 0)
    carbon   = info.get("avg_carbon_gco2_kwh", 0)
    cost     = info.get("avg_energy_cost_eur", 0)
    sla_ok   = 8 - sla_v
    print(
        f"  [{agent_name.upper():7s}] "
        f"Step {step:4d} | Hour {int(hour):02d}:00 | "
        f"Reward: {reward:+.3f} | "
        f"SLA {sla_ok}/8 | "
        f"Carbon: {carbon:5.1f} gCO2/kWh | "
        f"Cost: €{cost:.4f}"
    )

def print_comparison(stats: dict):
    """Print side-by-side comparison table (for the research paper)."""
    print(f"\n{'─'*70}")
    print(f"  {'AGENT':<12} {'Avg Reward':>12} {'SLA Rate':>10} {'Avg Carbon':>12} {'Avg Cost':>12}")
    print(f"{'─'*70}")
    for name, s in stats.items():
        steps = max(s["steps"], 1)
        print(
            f"  {name.upper():<12} "
            f"{s['total_reward']/steps:>12.4f} "
            f"{s['sla_ok_count']/max(s['total_sfcs'],1)*100:>9.1f}% "
            f"{s['total_carbon']/steps:>10.1f} gCO2 "
            f"€{s['total_cost']/steps:>10.5f}"
        )
    print(f"{'─'*70}\n")

def make_stats():
    return {"total_reward": 0, "sla_ok_count": 0, "total_sfcs": 0,
            "total_carbon": 0, "total_cost": 0, "steps": 0}

def update_stats(s: dict, reward: float, info: dict):
    s["total_reward"] += reward
    s["total_carbon"]  += info.get("avg_carbon_gco2_kwh", 0)
    s["total_cost"]    += info.get("avg_energy_cost_eur", 0)
    s["sla_ok_count"]  += (8 - info.get("sla_violations", 0))
    s["total_sfcs"]    += 8
    s["steps"]         += 1

# ── Agent runners ─────────────────────────────────────────────────────────────

def run_single(agent_name: str, model_path: str = None):
    """Run a single agent — pushes decisions to Spring Boot."""
    print(f"\n  Initializing environment...")
    env = AppiaNetworkEnv()
    obs, _ = env.reset()

    if agent_name == "ppo":
        agent = AppiaAgent(model_path=model_path).build()
    elif agent_name == "greedy":
        agent = GreedyEnergyAgent(nodes=env.nodes, sfcs=env.sfcs)
    else:
        agent = RandomAgent(n_nodes=len(env.nodes), n_sfcs=len(env.sfcs))

    print(f"  Agent ready: {agent_name.upper()}")
    print(f"  Pushing to Spring Boot at {BACKEND_URL}")
    print(f"  Tick interval: {TICK_INTERVAL}s | Ctrl+C to stop\n")
    print(f"{'─'*70}")

    step = 0
    try:
        while True:
            action = agent.predict(obs)
            obs, reward, terminated, truncated, info = env.step(action)

            # Push to Spring Boot
            push_telemetry(env)
            push_placements(env, action, reward, agent_name)

            print_tick(step, env.current_hour, reward, info, agent_name)

            if terminated or truncated:
                obs, _ = env.reset()
                print("  [Episode complete — resetting environment]")

            step += 1
            time.sleep(TICK_INTERVAL)

    except KeyboardInterrupt:
        print(f"\n  Stopped after {step} steps.")

def run_compare():
    """
    Run PPO, Greedy, and Random agents simultaneously.
    Each has its own env copy. Prints comparison table every 10 steps.
    This generates the research paper benchmark data.
    """
    print("\n  Initializing 3 environments (PPO / Greedy / Random)...")

    env_ppo    = AppiaNetworkEnv(seed=42)
    env_greedy = AppiaNetworkEnv(seed=42)
    env_random = AppiaNetworkEnv(seed=42)

    obs_ppo,    _ = env_ppo.reset(seed=42)
    obs_greedy, _ = env_greedy.reset(seed=42)
    obs_random, _ = env_random.reset(seed=42)

    agent_ppo    = AppiaAgent().build()
    agent_greedy = GreedyEnergyAgent(nodes=env_greedy.nodes, sfcs=env_greedy.sfcs)
    agent_random = RandomAgent(n_nodes=len(env_random.nodes), n_sfcs=len(env_random.sfcs))

    stats = {
        "ppo":    make_stats(),
        "greedy": make_stats(),
        "random": make_stats(),
    }

    print("  All agents ready. Running comparison...\n")
    print("  [NOTE] Spring Boot receives PPO decisions only in compare mode.\n")
    print(f"{'─'*70}")

    step = 0
    try:
        while True:
            # PPO step
            act_ppo = agent_ppo.predict(obs_ppo)
            obs_ppo, r_ppo, done_ppo, _, info_ppo = env_ppo.step(act_ppo)
            update_stats(stats["ppo"], r_ppo, info_ppo)
            if done_ppo: obs_ppo, _ = env_ppo.reset()

            # Greedy step
            act_greedy = agent_greedy.predict(obs_greedy)
            obs_greedy, r_greedy, done_greedy, _, info_greedy = env_greedy.step(act_greedy)
            update_stats(stats["greedy"], r_greedy, info_greedy)
            if done_greedy: obs_greedy, _ = env_greedy.reset()

            # Random step
            act_random = agent_random.predict(obs_random)
            obs_random, r_random, done_random, _, info_random = env_random.step(act_random)
            update_stats(stats["random"], r_random, info_random)
            if done_random: obs_random, _ = env_random.reset()

            # Push PPO decisions to Spring Boot (the "proposed" agent)
            push_telemetry(env_ppo)
            push_placements(env_ppo, act_ppo, r_ppo, "ppo")

            # Console output
            print_tick(step, env_ppo.current_hour, r_ppo,    info_ppo,    "ppo")
            print_tick(step, env_greedy.current_hour, r_greedy, info_greedy, "greedy")
            print_tick(step, env_random.current_hour, r_random, info_random, "random")
            print()

            # Print comparison table every 10 steps
            if (step + 1) % 10 == 0:
                print_comparison(stats)

            step += 1
            time.sleep(TICK_INTERVAL)

    except KeyboardInterrupt:
        print(f"\n  Stopped after {step} steps. Final results:")
        print_comparison(stats)

# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    global TICK_INTERVAL  # must be declared before any use of the variable

    parser = argparse.ArgumentParser(
        description="Appia Live RL Orchestrator — wires Python agent to Spring Boot"
    )
    parser.add_argument(
        "--agent", choices=["ppo", "greedy", "random", "compare"],
        default="greedy",
        help="Agent to run (default: greedy — no model training needed)"
    )
    parser.add_argument(
        "--model", type=str, default=None,
        help="Path to trained PPO model (.zip) for --agent ppo"
    )
    parser.add_argument(
        "--interval", type=float, default=TICK_INTERVAL,
        help=f"Seconds between ticks (default: {TICK_INTERVAL})"
    )
    args = parser.parse_args()
    TICK_INTERVAL = args.interval

    print("\n" + "="*70)
    print("  APPIA Live RL Orchestrator")
    print("  Connecting Python agent → Spring Boot → React Dashboard")
    print("="*70)

    # Verify backend before starting
    print("\n  Checking Spring Boot backend...")
    if not check_backend():
        print("\n  Start Spring Boot first: cd backend && run.bat")
        sys.exit(1)

    if args.agent == "compare":
        run_compare()
    else:
        run_single(args.agent, model_path=args.model)


if __name__ == "__main__":
    main()
