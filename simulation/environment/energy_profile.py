"""
Appia — Energy Profile Models
Simulates realistic time-varying energy sources: Solar, Wind, Grid, Battery, Backup.
Each source tracks availability, carbon intensity (gCO2/kWh), and cost (€/kWh).
"""

import math
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class EnergySourceType(Enum):
    SOLAR = "solar"
    WIND = "wind"
    GRID = "grid"
    BATTERY = "battery"
    BACKUP = "backup"  # Diesel generator — last resort


@dataclass
class EnergySource:
    """A single energy source attached to a network node."""
    source_type: EnergySourceType
    capacity_kw: float               # Max power output in kW
    carbon_intensity: float          # gCO2/kWh — lower is greener
    cost_per_kwh: float              # €/kWh
    availability: float = 1.0        # 0.0 to 1.0 — current availability
    battery_level: float = 1.0       # Only for BATTERY type (0.0 to 1.0)

    def current_power_kw(self) -> float:
        """Returns actual available power right now."""
        if self.source_type == EnergySourceType.BATTERY:
            return self.capacity_kw * self.battery_level
        return self.capacity_kw * self.availability

    def effective_carbon(self) -> float:
        """Carbon intensity weighted by availability."""
        return self.carbon_intensity * self.availability

    def drain_battery(self, load_kw: float, duration_hours: float = 1.0):
        """Deplete battery based on load. Only applies to BATTERY type."""
        if self.source_type == EnergySourceType.BATTERY and self.capacity_kw > 0:
            consumed = (load_kw * duration_hours) / self.capacity_kw
            self.battery_level = max(0.0, self.battery_level - consumed)

    def charge_battery(self, charge_kw: float, duration_hours: float = 1.0):
        """Charge battery from excess renewable energy."""
        if self.source_type == EnergySourceType.BATTERY and self.capacity_kw > 0:
            gained = (charge_kw * duration_hours) / self.capacity_kw
            self.battery_level = min(1.0, self.battery_level + gained)


class EnergyProfileSimulator:
    """
    Simulates realistic time-varying energy profiles for a 24-hour cycle.
    Used to update node energy sources at each simulation timestep.
    """

    @staticmethod
    def solar_availability(hour: float, season: str = "summer") -> float:
        """
        Solar availability follows a bell curve centered at solar noon.
        Peak varies by season.
        """
        if season == "summer":
            peak_hour, peak_value, width = 13.0, 0.95, 5.0
        elif season == "winter":
            peak_hour, peak_value, width = 12.5, 0.55, 3.5
        else:  # spring/autumn
            peak_hour, peak_value, width = 13.0, 0.75, 4.5

        if hour < 6.0 or hour > 20.0:
            return 0.0
        availability = peak_value * math.exp(-((hour - peak_hour) ** 2) / (2 * width ** 2))
        # Add slight stochastic noise
        noise = random.gauss(0, 0.03)
        return max(0.0, min(1.0, availability + noise))

    @staticmethod
    def wind_availability(hour: float) -> float:
        """
        Wind is more stochastic. Slightly stronger at night and early morning.
        Uses a combination of sinusoidal pattern + random walk noise.
        """
        base = 0.55 + 0.15 * math.sin(2 * math.pi * (hour - 14) / 24)
        noise = random.gauss(0, 0.08)
        return max(0.05, min(1.0, base + noise))

    @staticmethod
    def grid_carbon_intensity(hour: float, location: str = "EU") -> float:
        """
        Grid carbon intensity varies by time of day and location.
        Lower at night (less industrial load), higher at peak hours.
        EU values in gCO2/kWh.
        """
        base_intensity = {
            "NO": 25,    # Norway — mostly hydro
            "DK": 120,   # Denmark — wind-heavy
            "DE": 320,   # Germany — mixed
            "IT": 280,   # Italy — mixed
            "ET": 520,   # Ethiopia — grid unreliable, coal backup
            "EU": 250,   # Generic EU average
        }.get(location, 250)

        # Peak hours (8-10am, 6-8pm) have higher carbon intensity
        peak_factor = 1.0
        if 8 <= hour <= 10 or 18 <= hour <= 20:
            peak_factor = 1.25
        elif 0 <= hour <= 5:
            peak_factor = 0.75  # Off-peak, lower carbon

        noise = random.gauss(0, 0.05) * base_intensity
        return max(10.0, base_intensity * peak_factor + noise)

    @staticmethod
    def grid_price(hour: float, location: str = "EU") -> float:
        """
        Electricity spot price in €/kWh. Follows typical day-ahead market patterns.
        """
        base_price = {
            "NO": 0.04,
            "DK": 0.12,
            "DE": 0.18,
            "IT": 0.22,
            "ET": 0.08,
            "EU": 0.15,
        }.get(location, 0.15)

        # Morning and evening peaks
        if 7 <= hour <= 9 or 17 <= hour <= 21:
            factor = 1.4
        elif 0 <= hour <= 5:
            factor = 0.6  # Night — cheap
        else:
            factor = 1.0

        noise = random.gauss(0, 0.01)
        return max(0.01, base_price * factor + noise)


# ── Pre-built energy profiles for the 5 Appia network sites ──────────────────

def create_oslo_profile() -> list:
    """Oslo Edge Node — Norway: Hydro Grid + Solar + Battery"""
    return [
        EnergySource(EnergySourceType.GRID,    capacity_kw=500, carbon_intensity=25,  cost_per_kwh=0.04),
        EnergySource(EnergySourceType.SOLAR,   capacity_kw=150, carbon_intensity=5,   cost_per_kwh=0.01),
        EnergySource(EnergySourceType.BATTERY, capacity_kw=100, carbon_intensity=0,   cost_per_kwh=0.00, battery_level=0.8),
    ]

def create_copenhagen_profile() -> list:
    """Copenhagen Core Node — Denmark: Wind + Grid + Battery"""
    return [
        EnergySource(EnergySourceType.WIND,    capacity_kw=400, carbon_intensity=15,  cost_per_kwh=0.02),
        EnergySource(EnergySourceType.GRID,    capacity_kw=600, carbon_intensity=120, cost_per_kwh=0.12),
        EnergySource(EnergySourceType.BATTERY, capacity_kw=200, carbon_intensity=0,   cost_per_kwh=0.00, battery_level=0.9),
    ]

def create_milan_profile() -> list:
    """Milan Data Center — Italy: Grid + Solar + Battery"""
    return [
        EnergySource(EnergySourceType.GRID,    capacity_kw=1000, carbon_intensity=280, cost_per_kwh=0.22),
        EnergySource(EnergySourceType.SOLAR,   capacity_kw=200,  carbon_intensity=5,   cost_per_kwh=0.01),
        EnergySource(EnergySourceType.BATTERY, capacity_kw=150,  carbon_intensity=0,   cost_per_kwh=0.00, battery_level=0.7),
    ]

def create_frankfurt_profile() -> list:
    """Frankfurt Hub — Germany: Grid + Wind + Solar"""
    return [
        EnergySource(EnergySourceType.GRID,    capacity_kw=2000, carbon_intensity=320, cost_per_kwh=0.18),
        EnergySource(EnergySourceType.WIND,    capacity_kw=300,  carbon_intensity=12,  cost_per_kwh=0.02),
        EnergySource(EnergySourceType.SOLAR,   capacity_kw=250,  carbon_intensity=5,   cost_per_kwh=0.01),
    ]

def create_addis_profile() -> list:
    """Addis Ababa Edge Node — Ethiopia: Solar + Battery + Backup (power shedding scenario)"""
    return [
        EnergySource(EnergySourceType.SOLAR,   capacity_kw=100, carbon_intensity=8,   cost_per_kwh=0.01),
        EnergySource(EnergySourceType.BATTERY, capacity_kw=200, carbon_intensity=0,   cost_per_kwh=0.00, battery_level=0.6),
        EnergySource(EnergySourceType.BACKUP,  capacity_kw=150, carbon_intensity=680, cost_per_kwh=0.35, availability=0.0),
    ]
