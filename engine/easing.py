"""
Mathematical easing and Cubic-Bezier interpolation engine.
Implements exact After Effects / Alight Motion motion curves using Newton-Raphson root finding.
"""

import math

def solve_cubic_bezier(t: float, p1x: float, p1y: float, p2x: float, p2y: float) -> float:
    """
    Standard cubic bezier solver (matching CSS transition-timing-function and AE graph editor).
    Curve starts at (0, 0) and ends at (1, 1).
    Control points are (p1x, p1y) and (p2x, p2y).
    """
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    
    # Pre-coefficients for x(t) and y(t)
    cx = 3.0 * p1x
    bx = 3.0 * (p2x - p1x) - cx
    ax = 1.0 - cx - bx

    cy = 3.0 * p1y
    by = 3.0 * (p2y - p1y) - cy
    ay = 1.0 - cy - by

    def sample_curve_x(u):
        return ((ax * u + bx) * u + cx) * u

    def sample_curve_y(u):
        return ((ay * u + by) * u + cy) * u

    def sample_curve_derivative_x(u):
        return (3.0 * ax * u + 2.0 * bx) * u + cx

    # Newton-Raphson iteration to find u for given t = x(u)
    u = t
    for _ in range(8):
        x = sample_curve_x(u) - t
        if abs(x) < 1e-5:
            return sample_curve_y(u)
        dx = sample_curve_derivative_x(u)
        if abs(dx) < 1e-6:
            break
        u -= x / dx

    # Fallback to bisection if Newton-Raphson diverges
    u0, u1 = 0.0, 1.0
    u = t
    for _ in range(12):
        x = sample_curve_x(u)
        if abs(x - t) < 1e-5:
            return sample_curve_y(u)
        if t > x:
            u0 = u
        else:
            u1 = u
        u = (u1 + u0) * 0.5

    return sample_curve_y(u)


class EasingCurves:
    """Pre-configured high-end motion presets found in After Effects & Alight Motion."""
    
    LINEAR = "linear"
    EASY_EASE = "easy_ease"         # Standard AE F9 (0.25, 0.1, 0.25, 1.0)
    EASE_IN = "ease_in"             # Smooth entry (0.42, 0.0, 1.0, 1.0)
    EASE_OUT = "ease_out"           # Smooth brake (0.0, 0.0, 0.58, 1.0)
    EASE_IN_OUT = "ease_in_out"     # S-Curve (0.42, 0.0, 0.58, 1.0)
    EXPO_OUT = "expo_out"           # Snappy pop (0.16, 1.0, 0.3, 1.0) - modern motion graphic style
    EXPO_IN = "expo_in"             # Snappy exit (0.7, 0.0, 0.84, 0.0)
    OVERSHOOT = "overshoot"         # Modern spring pop with slight bounce over 1.0
    BOUNCE = "bounce"               # Elastic physical bounce
    CUSTOM = "custom"

    PRESETS = {
        LINEAR: (0.0, 0.0, 1.0, 1.0),
        EASY_EASE: (0.25, 0.1, 0.25, 1.0),
        EASE_IN: (0.42, 0.0, 1.0, 1.0),
        EASE_OUT: (0.0, 0.0, 0.58, 1.0),
        EASE_IN_OUT: (0.42, 0.0, 0.58, 1.0),
        EXPO_OUT: (0.16, 1.0, 0.3, 1.0),
        EXPO_IN: (0.7, 0.0, 0.84, 0.0),
        OVERSHOOT: (0.34, 1.56, 0.64, 1.0),
    }

    @classmethod
    def evaluate(cls, t: float, curve_type: str = EASY_EASE, custom_points: tuple = None) -> float:
        """
        Evaluate progress 0.0 <= t <= 1.0 using the selected curve.
        Returns interpolated progress (can slightly exceed 0..1 for bounce/overshoot).
        """
        t = max(0.0, min(1.0, t))
        
        if curve_type == cls.LINEAR:
            return t
        
        if curve_type == cls.BOUNCE:
            # Multi-stage dampening bounce
            if t < (1 / 2.75):
                return 7.5625 * t * t
            elif t < (2 / 2.75):
                t -= (1.5 / 2.75)
                return 7.5625 * t * t + 0.75
            elif t < (2.5 / 2.75):
                t -= (2.25 / 2.75)
                return 7.5625 * t * t + 0.9375
            else:
                t -= (2.625 / 2.75)
                return 7.5625 * t * t + 0.984375

        points = custom_points if (curve_type == cls.CUSTOM and custom_points) else cls.PRESETS.get(curve_type, cls.PRESETS[cls.EASY_EASE])
        return solve_cubic_bezier(t, points[0], points[1], points[2], points[3])
