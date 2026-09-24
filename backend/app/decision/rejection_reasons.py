from enum import Enum

class RejectionReason(str, Enum):
    """
    Standardized false-positive rejection reason codes for diagnostic logging,
    dataset curation, and operator explainability.
    """
    NONE = "NONE"
    LOW_YOLO_CONFIDENCE = "LOW_YOLO_CONFIDENCE"
    THERMAL_BLOB = "THERMAL_BLOB"
    POOR_HUMAN_SHAPE = "POOR_HUMAN_SHAPE"
    INSUFFICIENT_PERSISTENCE = "INSUFFICIENT_PERSISTENCE"
    STATIONARY_BACKGROUND = "STATIONARY_BACKGROUND"
    NONHUMAN_CONTEXT = "NONHUMAN_CONTEXT"
    RGB_MISMATCH = "RGB_MISMATCH"
    DEPTH_MISMATCH = "DEPTH_MISMATCH"
    TRACK_LOST = "TRACK_LOST"
    LOW_FUSED_CONFIDENCE = "LOW_FUSED_CONFIDENCE"
    SECONDARY_CNN_REJECTED = "SECONDARY_CNN_REJECTED"

    @classmethod
    def get_description(cls, code: "RejectionReason") -> str:
        descriptions = {
            cls.NONE: "Candidate fully verified as survivor.",
            cls.LOW_YOLO_CONFIDENCE: "YOLO detection confidence below reliable operational threshold.",
            cls.THERMAL_BLOB: "Thermal characteristics resemble an amorphous hot blob without anatomical signature.",
            cls.POOR_HUMAN_SHAPE: "Contour aspect ratio and solidity incompatible with human geometry.",
            cls.INSUFFICIENT_PERSISTENCE: "Target disappeared before meeting required multi-frame track stability.",
            cls.STATIONARY_BACKGROUND: "Target identified as static ambient terrain/structural heat element.",
            cls.NONHUMAN_CONTEXT: "Context indicates non-human heat source (engine, hot rock, or ember).",
            cls.RGB_MISMATCH: "RGB visual features do not corroborate thermal human candidate.",
            cls.DEPTH_MISMATCH: "LiDAR/depth profile indicates surface inconsistency or background coplanarity.",
            cls.TRACK_LOST: "Candidate track disappeared from field of view.",
            cls.LOW_FUSED_CONFIDENCE: "Multi-modal confidence fusion score failed confirmation threshold.",
            cls.SECONDARY_CNN_REJECTED: "Secondary crop verifier classified signature as non-human."
        }
        return descriptions.get(code, "Unspecified rejection reason.")
