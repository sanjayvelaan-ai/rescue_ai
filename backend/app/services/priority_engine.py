from typing import Tuple

def calculate_survivor_priority(
    rgb_confirmed: bool,
    thermal_confirmed: bool,
    model_conf: float,
    fusion_conf: float,
    stability_score: int,
    near_hazard: bool = False
) -> Tuple[str, str]:
    """
    Calculates survivor priority status and transparent justification explanation string.
    Returns (priority_level, priority_reason).
    """
    if (rgb_confirmed and thermal_confirmed and fusion_conf >= 0.85) or near_hazard or (fusion_conf >= 0.90 and stability_score >= 3):
        priority = "CRITICAL"
        reasons = []
        if rgb_confirmed and thermal_confirmed:
            reasons.append("RGB + thermal dual-stream confirmation")
        if near_hazard:
            reasons.append("sustained detection near active hazard zone")
        if fusion_conf >= 0.85:
            reasons.append(f"high fusion confidence ({int(fusion_conf * 100)}%)")
        if stability_score >= 3:
            reasons.append("sustained multi-frame temporal stability")
        
        reason_str = " & ".join(reasons) if reasons else "Multi-stream critical threat confirmation."
        return priority, reason_str.capitalize()

    elif (rgb_confirmed and thermal_confirmed) or (fusion_conf >= 0.75 and stability_score >= 2):
        priority = "HIGH"
        reason_str = f"Strong multi-sensor correlation with {int(fusion_conf * 100)}% fusion confidence."
        return priority, reason_str

    elif fusion_conf >= 0.60 or stability_score >= 2:
        priority = "MEDIUM"
        reason_str = "Probable survivor detection requiring ground rescue verification."
        return priority, reason_str

    else:
        priority = "LOW"
        reason_str = "Single-stream initial detection with baseline confidence."
        return priority, reason_str
