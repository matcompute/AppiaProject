"""
Appia — PPO Agent Wrapper
Wraps Stable-Baselines3 PPO for the Appia multi-objective environment.
Includes custom policy architecture suited for the network orchestration problem.
"""

import os
import numpy as np
from typing import Optional, Callable
from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.callbacks import (
    EvalCallback, StopTrainingOnRewardThreshold, BaseCallback
)
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

from simulation.environment.network_env import AppiaNetworkEnv


class AppiaMetricsCallback(BaseCallback):
    """
    Custom callback to log Appia-specific metrics during training.
    Tracks SLA violations, carbon reduction, and energy cost trends.
    """

    def __init__(self, verbose: int = 0):
        super().__init__(verbose)
        self.episode_rewards = []
        self.episode_sla_violations = []
        self.episode_carbon = []

    def _on_step(self) -> bool:
        # Log custom metrics from info dict
        for info in self.locals.get("infos", []):
            if "sla_violations" in info:
                self.episode_sla_violations.append(info["sla_violations"])
                self.episode_carbon.append(info.get("avg_carbon_gco2_kwh", 0))
        return True

    def get_summary(self) -> dict:
        if not self.episode_sla_violations:
            return {}
        return {
            "avg_sla_violations_per_step": np.mean(self.episode_sla_violations),
            "avg_carbon_gco2_kwh": np.mean(self.episode_carbon),
            "total_steps": len(self.episode_sla_violations),
        }


class AppiaAgent:
    """
    Appia PPO Agent — wraps SB3 PPO with Appia-specific configuration.

    Architecture:
    - Policy network: MLP [256, 256] with tanh activation
    - Value network: MLP [256, 256] with tanh activation
    - Algorithm: PPO with clipping (epsilon=0.2)
    - Entropy bonus: encourages exploration of placement strategies

    This is a solid baseline for the research paper.
    The next step is to compare against:
    1. Random placement (baseline)
    2. Round-robin placement (baseline)
    3. Energy-greedy (greedy baseline)
    4. This PPO agent (proposed)
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        n_envs: int = 4,
        device: str = "auto",
        verbose: int = 1,
    ):
        self.model_path = model_path
        self.n_envs = n_envs
        self.device = device
        self.verbose = verbose
        self.model: Optional[PPO] = None
        self.metrics_callback = AppiaMetricsCallback()

    def _make_env(self, seed: int = 0) -> Callable:
        """Factory function for vectorized environment creation."""
        def _init():
            env = AppiaNetworkEnv(seed=seed)
            env = Monitor(env)
            return env
        return _init

    def build(self) -> "AppiaAgent":
        """Build or load the PPO model."""
        if self.model_path and os.path.exists(self.model_path + ".zip"):
            print(f"[Appia] Loading existing model from {self.model_path}")
            env = DummyVecEnv([self._make_env(i) for i in range(self.n_envs)])
            self.model = PPO.load(self.model_path, env=env, device=self.device)
        else:
            print(f"[Appia] Building new PPO model...")
            env = DummyVecEnv([self._make_env(i) for i in range(self.n_envs)])

            self.model = PPO(
                policy="MlpPolicy",
                env=env,
                # Hyperparameters (tuned for network orchestration)
                learning_rate=3e-4,
                n_steps=512,            # Steps per rollout per env
                batch_size=64,
                n_epochs=10,
                gamma=0.95,             # Slightly lower — rewards are immediate
                gae_lambda=0.95,
                clip_range=0.2,
                ent_coef=0.01,          # Entropy bonus for exploration
                vf_coef=0.5,
                max_grad_norm=0.5,
                # Network architecture
                policy_kwargs=dict(
                    net_arch=dict(
                        pi=[256, 256],  # Policy network
                        vf=[256, 256],  # Value network
                    ),
                    activation_fn=__import__("torch").nn.Tanh,
                ),
                verbose=self.verbose,
                device=self.device,
            )
            print(f"[Appia] Model built. Parameters: {self._count_parameters():,}")
        return self

    def train(
        self,
        total_timesteps: int = 100_000,
        save_path: Optional[str] = None,
        eval_freq: int = 5000,
    ) -> dict:
        """
        Train the PPO agent.
        Returns training summary with key metrics.
        """
        assert self.model is not None, "Call build() first"
        print(f"\n[Appia] Starting training for {total_timesteps:,} timesteps...")

        callbacks = [self.metrics_callback]

        # Evaluation callback
        eval_env = Monitor(AppiaNetworkEnv())
        eval_callback = EvalCallback(
            eval_env,
            best_model_save_path=save_path or "./models/",
            log_path="./logs/",
            eval_freq=eval_freq,
            deterministic=True,
            render=False,
            verbose=self.verbose,
        )
        callbacks.append(eval_callback)

        self.model.learn(
            total_timesteps=total_timesteps,
            callback=callbacks,
            progress_bar=True,
        )

        if save_path:
            self.model.save(save_path)
            print(f"[Appia] Model saved to {save_path}.zip")

        summary = self.metrics_callback.get_summary()
        print(f"\n[Appia] Training complete!")
        print(f"  Avg SLA violations/step: {summary.get('avg_sla_violations_per_step', 'N/A'):.3f}")
        print(f"  Avg carbon intensity:    {summary.get('avg_carbon_gco2_kwh', 'N/A'):.1f} gCO2/kWh")
        return summary

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """Run inference — get placement decision for an observation."""
        assert self.model is not None, "Call build() first"
        action, _ = self.model.predict(obs, deterministic=deterministic)
        return action

    def _count_parameters(self) -> int:
        """Count trainable parameters in the policy network."""
        if self.model is None:
            return 0
        return sum(p.numel() for p in self.model.policy.parameters() if p.requires_grad)


class RandomAgent:
    """
    Baseline: Random placement agent.
    Used as a comparison baseline in the research paper.
    """
    def __init__(self, n_nodes: int, n_sfcs: int):
        self.n_nodes = n_nodes
        self.n_sfcs = n_sfcs

    def predict(self, obs: np.ndarray, deterministic: bool = False) -> np.ndarray:
        return np.array([np.random.randint(0, self.n_nodes + 1) for _ in range(self.n_sfcs)])


class GreedyEnergyAgent:
    """
    Baseline: Always place SFCs on the node with lowest carbon intensity.
    Used as a comparison baseline in the research paper.
    """
    def __init__(self, nodes, sfcs):
        self.nodes = nodes
        self.sfcs = sfcs
        self.n_nodes = len(nodes)

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """Place each SFC on the greenest available node."""
        # Find node with lowest carbon (first NODE_FEATURES*n entries in obs)
        from simulation.environment.network_env import NODE_FEATURES
        carbon_values = [obs[i * NODE_FEATURES] for i in range(self.n_nodes)]
        best_node = int(np.argmin(carbon_values))
        return np.array([best_node] * len(self.sfcs))
