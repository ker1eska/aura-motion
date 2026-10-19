"""
Keyframe animation engine for property interpolation.
Supports scalar, 2D vector (X, Y), 3D vector, and RGBA color interpolation.
"""

from typing import Any, List, Optional, Tuple, Union
from engine.easing import EasingCurves


class Keyframe:
    def __init__(
        self,
        time: float,
        value: Union[float, Tuple, List],
        curve: str = EasingCurves.EASY_EASE,
        custom_curve: Optional[Tuple[float, float, float, float]] = None
    ):
        self.time = float(time)
        self.value = value
        self.curve = curve
        self.custom_curve = custom_curve  # (p1x, p1y, p2x, p2y) for graph editor

    def to_dict(self) -> dict:
        return {
            "time": self.time,
            "value": self.value,
            "curve": self.curve,
            "custom_curve": self.custom_curve
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Keyframe':
        return cls(
            time=data["time"],
            value=data["value"],
            curve=data.get("curve", EasingCurves.EASY_EASE),
            custom_curve=tuple(data["custom_curve"]) if data.get("custom_curve") else None
        )


class AnimatableProperty:
    """
    Represents an animatable property (e.g. position_x, scale, opacity, glow_radius).
    If keyframes are empty, returns a static default value.
    """
    def __init__(self, name: str, default_value: Any):
        self.name = name
        self.default_value = default_value
        self.keyframes: List[Keyframe] = []

    def set_static(self, value: Any):
        self.default_value = value
        self.keyframes.clear()

    def add_keyframe(
        self,
        time: float,
        value: Any = None,
        curve: str = EasingCurves.EASY_EASE,
        custom_curve: Optional[Tuple[float, float, float, float]] = None
    ) -> Keyframe:
        if value is None:
            value = self.get_value(time)
            
        # Overwrite if exists at exact same time (< 1ms diff)
        for k in self.keyframes:
            if abs(k.time - time) < 0.001:
                k.value = value
                k.curve = curve
                k.custom_curve = custom_curve
                return k

        kf = Keyframe(time, value, curve, custom_curve)
        self.keyframes.append(kf)
        self.keyframes.sort(key=lambda x: x.time)
        return kf

    def remove_keyframe_at(self, time: float, tolerance: float = 0.05) -> bool:
        for i, k in enumerate(self.keyframes):
            if abs(k.time - time) <= tolerance:
                del self.keyframes[i]
                return True
        return False

    def has_keyframe_at(self, time: float, tolerance: float = 0.05) -> bool:
        return any(abs(k.time - time) <= tolerance for k in self.keyframes)

    def _lerp_values(self, v1: Any, v2: Any, progress: float) -> Any:
        if isinstance(v1, (int, float)) and isinstance(v2, (int, float)):
            return v1 + (v2 - v1) * progress
        
        if isinstance(v1, (list, tuple)) and isinstance(v2, (list, tuple)):
            interpolated = [
                self._lerp_values(a, b, progress) for a, b in zip(v1, v2)
            ]
            return tuple(interpolated) if isinstance(v1, tuple) else interpolated
            
        return v1 if progress < 0.5 else v2

    def get_value(self, time: float) -> Any:
        if not self.keyframes:
            return self.default_value
        
        if len(self.keyframes) == 1 or time <= self.keyframes[0].time:
            return self.keyframes[0].value
            
        if time >= self.keyframes[-1].time:
            return self.keyframes[-1].value

        # Locate interval
        for i in range(len(self.keyframes) - 1):
            k1 = self.keyframes[i]
            k2 = self.keyframes[i + 1]
            if k1.time <= time <= k2.time:
                span = k2.time - k1.time
                if span <= 1e-6:
                    return k2.value
                linear_t = (time - k1.time) / span
                eased_t = EasingCurves.evaluate(linear_t, k1.curve, k1.custom_curve)
                return self._lerp_values(k1.value, k2.value, eased_t)

        return self.keyframes[-1].value

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "default_value": self.default_value,
            "keyframes": [k.to_dict() for k in self.keyframes]
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'AnimatableProperty':
        prop = cls(data["name"], data["default_value"])
        for kd in data.get("keyframes", []):
            prop.keyframes.append(Keyframe.from_dict(kd))
        return prop
