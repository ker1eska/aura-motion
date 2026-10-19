"""
Kinetic Typography Engine.
Provides per-character animation, staggered transitions, and motion presets
matching After Effects Text Animators.
"""

import math
from typing import List, Dict, Any
from engine.easing import EasingCurves, solve_cubic_bezier


class TextAnimationPreset:
    STAGGER_POP = "stagger_pop"
    KINETIC_WAVE = "kinetic_wave"
    NEON_TYPEWRITER = "neon_typewriter"
    GLITCH_SCATTER = "glitch_scatter"
    EXPONENTIAL_ZOOM = "expo_zoom"

    ALL_PRESETS = [
        {"id": STAGGER_POP, "name": "Stagger Pop & Bounce", "desc": "Characters pop in with physical overshoot"},
        {"id": KINETIC_WAVE, "name": "Kinetic Sine Wave", "desc": "Continuous fluid wave ripple across text"},
        {"id": NEON_TYPEWRITER, "name": "Neon Typewriter", "desc": "Sequential character reveal with cursor glow"},
        {"id": GLITCH_SCATTER, "name": "Cyber Glitch Scatter", "desc": "Chaotic digital jitter settling into position"},
        {"id": EXPONENTIAL_ZOOM, "name": "Deep Space Zoom", "desc": "Cinematic scale and opacity rush"}
    ]


class CharTransform:
    def __init__(
        self,
        char: str,
        index: int,
        offset_x: float = 0.0,
        offset_y: float = 0.0,
        scale: float = 1.0,
        rotation: float = 0.0,
        opacity: float = 1.0
    ):
        self.char = char
        self.index = index
        self.offset_x = offset_x
        self.offset_y = offset_y
        self.scale = scale
        self.rotation = rotation
        self.opacity = opacity


class KineticTextEngine:
    @staticmethod
    def evaluate_text(
        text: str,
        time: float,
        preset: str = TextAnimationPreset.STAGGER_POP,
        duration: float = 2.0,
        stagger_delay: float = 0.05
    ) -> List[CharTransform]:
        """
        Evaluate position, scale, rotation, and opacity for every character in `text`
        at timeline time `time` based on the chosen animation preset.
        """
        chars = list(text)
        total_chars = len(chars)
        results: List[CharTransform] = []

        if total_chars == 0:
            return results

        for i, ch in enumerate(chars):
            char_time = max(0.0, time - (i * stagger_delay))

            if preset == TextAnimationPreset.STAGGER_POP:
                # 0.0 to 0.7s per character entrance with overshoot
                anim_progress = min(1.0, char_time / 0.6)
                eased = EasingCurves.evaluate(anim_progress, EasingCurves.OVERSHOOT)
                opacity = min(1.0, char_time / 0.25)
                offset_y = (1.0 - eased) * 60.0   # drop from 60px above
                scale = eased
                rot = (1.0 - eased) * 15.0 * (1 if i % 2 == 0 else -1)
                results.append(CharTransform(ch, i, 0.0, offset_y, max(0.0, scale), rot, opacity))

            elif preset == TextAnimationPreset.KINETIC_WAVE:
                # Endless harmonic wave running through text
                phase = time * 5.0 - (i * 0.45)
                offset_y = math.sin(phase) * 18.0
                rot = math.cos(phase) * 8.0
                scale = 1.0 + math.sin(phase) * 0.12
                opacity = 1.0
                results.append(CharTransform(ch, i, 0.0, offset_y, scale, rot, opacity))

            elif preset == TextAnimationPreset.NEON_TYPEWRITER:
                # Revealed character check
                revealed = char_time > 0.0
                if not revealed:
                    results.append(CharTransform(ch, i, 0.0, 0.0, 0.0, 0.0, 0.0))
                else:
                    # Flash upon appearing
                    flash_progress = min(1.0, char_time / 0.15)
                    scale = 1.0 + (1.0 - flash_progress) * 0.4
                    results.append(CharTransform(ch, i, 0.0, 0.0, scale, 0.0, 1.0))

            elif preset == TextAnimationPreset.GLITCH_SCATTER:
                # Chaotic jitter settling into place over 1 second
                progress = min(1.0, char_time / 0.8)
                if progress >= 1.0:
                    results.append(CharTransform(ch, i, 0.0, 0.0, 1.0, 0.0, 1.0))
                else:
                    jitter_mag = (1.0 - progress)
                    seed = (time * 10.0 + i * 37.0)
                    dx = math.sin(seed * 1.7) * 35.0 * jitter_mag
                    dy = math.cos(seed * 2.3) * 35.0 * jitter_mag
                    rot = math.sin(seed * 3.1) * 30.0 * jitter_mag
                    opacity = 0.3 + 0.7 * progress if (int(seed * 10) % 2 == 0) else 1.0
                    results.append(CharTransform(ch, i, dx, dy, 1.0 + jitter_mag * 0.5, rot, opacity))

            elif preset == TextAnimationPreset.EXPONENTIAL_ZOOM:
                anim_progress = min(1.0, char_time / 0.7)
                eased = EasingCurves.evaluate(anim_progress, EasingCurves.EXPO_OUT)
                scale = 0.2 + 0.8 * eased
                opacity = min(1.0, char_time / 0.3)
                results.append(CharTransform(ch, i, 0.0, 0.0, scale, 0.0, opacity))

            else:
                # Default static
                results.append(CharTransform(ch, i, 0.0, 0.0, 1.0, 0.0, 1.0))

        return results
