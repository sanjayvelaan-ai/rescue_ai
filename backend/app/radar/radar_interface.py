"""
Hardware-Ready Abstract Radar Interface for RESCUE-AI.
Enables plug-and-play replacement of the simulated prototype with future physical UWB radar hardware.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

class RadarStatusDTO(BaseModel):
    status: str                         # ACTIVE, STANDBY, ERROR
    mode: str                           # RADAR SIMULATION MODE, HARDWARE ACTIVE
    hardware_connected: bool            # True only if physical sensor is detected
    tx_status: str                      # TRANSMITTING, IDLE
    rx_status: str                      # RECEIVING, IDLE
    signal_status: str                  # REFLECTION DETECTED, SEARCHING, NO SIGNAL
    target_status: str                  # POSSIBLE HUMAN, POSSIBLE OBJECT, NO TARGET
    frequency_ghz: float                # Center operating frequency (e.g. 4.3 GHz UWB)
    bandwidth_ghz: float                # Signal bandwidth (e.g. 1.5 GHz)
    signal_strength_pct: float          # Received signal strength percentage (0-100)
    estimated_range_m: float            # Estimated distance to target (meters)
    reflection_strength_db: float       # Peak reflection amplitude in dB
    clutter_attenuation_db: float       # Rubble/wall attenuation in dB
    obstruction_type: str               # CONCRETE_RUBBLE, BRICK_DEBRIS, DRYWALL
    test_running: bool                  # Whether an active test sequence is running
    presence_confidence: float          # 0.0 - 1.0 confidence in human target
    micro_doppler_hz: float             # Breathing/chest-wall micro-motion frequency
    waveform_sample_rate_m: float       # Range resolution step (m)
    timestamp: str

class RadarSensorInterface(ABC):
    """
    Abstract hardware interface for Ultra-Wideband (UWB) Through-Wall Radar.
    Concrete subclasses:
      - SimulationRadar: High-fidelity physics-based RF prototype simulation.
      - FuturePhysicalUWBRadar: Driver for physical pulsed UWB or FMCW radar hardware via serial/USB/SPI.
    """

    @abstractmethod
    def initialize(self) -> bool:
        """Initializes radar hardware/transceiver bus and internal buffers."""
        pass

    @abstractmethod
    def start_transmission(self) -> bool:
        """Begins RF impulse / chirp pulse transmission from TX antenna."""
        pass

    @abstractmethod
    def stop_transmission(self) -> bool:
        """Ceases RF pulse transmission."""
        pass

    @abstractmethod
    def receive_signal(self) -> Dict[str, Any]:
        """Reads raw A-scan waveform samples from the RX antenna ADC."""
        pass

    @abstractmethod
    def process_signal(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes signal processing pipeline:
        1. Clutter/background subtraction
        2. Bandpass filtering & noise suppression
        3. Time-of-flight range estimation
        4. CFAR peak detection
        5. Micro-Doppler vital sign extraction
        6. Human presence estimation
        """
        pass

    @abstractmethod
    def get_range(self) -> float:
        """Returns the current estimated distance to the primary target in meters."""
        pass

    @abstractmethod
    def detect_target(self) -> str:
        """Returns target classification: 'NO TARGET', 'POSSIBLE OBJECT', 'POSSIBLE HUMAN'."""
        pass

    @abstractmethod
    def get_status(self) -> RadarStatusDTO:
        """Returns comprehensive diagnostic telemetry and status DTO."""
        pass

    @abstractmethod
    def configure(self, **kwargs) -> Dict[str, Any]:
        """Updates configurable radar parameters (frequency, obstruction material, range, etc.)."""
        pass
