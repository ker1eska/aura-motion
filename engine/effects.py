"""
GPU Shader Effect Engine for iOS / OpenGL ES.
Provides After Effects style plugin effects: Deep Glow, Chromatic Aberration,
Glitch Distortion, Camera Shake, Wave Warp, and Film Grain.
"""

from typing import Dict, Any, List
from engine.keyframes import AnimatableProperty


# --- GLSL Shader Fragments (OpenGL ES 2.0 / 3.0 compliant) ---

GLSL_CHROMATIC_ABERRATION = """
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 v_tex_coords;
uniform sampler2D u_texture;
uniform float u_amount;      // Aberration intensity (0.0 to 0.05)
uniform float u_angle;       // Direction angle in radians

void main() {
    vec2 dir = vec2(cos(u_angle), sin(u_angle)) * u_amount;
    float r = texture2D(u_texture, v_tex_coords + dir).r;
    float g = texture2D(u_texture, v_tex_coords).g;
    float b = texture2D(u_texture, v_tex_coords - dir).b;
    float a = texture2D(u_texture, v_tex_coords).a;
    gl_FragColor = vec4(r, g, b, a);
}
"""

GLSL_GLITCH_DISPLACEMENT = """
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 v_tex_coords;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;    // 0.0 to 1.0
uniform float u_scanlines;    // 0.0 to 1.0

float random2d(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = v_tex_coords;
    
    // Horizontal slice displacement
    float slice_y = floor(uv.y * 30.0);
    float noise = random2d(vec2(slice_y, floor(u_time * 15.0)));
    
    if (noise < u_intensity * 0.4) {
        float offset = (random2d(vec2(slice_y, u_time)) - 0.5) * u_intensity * 0.15;
        uv.x += offset;
    }
    
    vec4 col = texture2D(u_texture, uv);
    
    // RGB split inside glitch
    if (u_intensity > 0.1) {
        col.r = texture2D(u_texture, uv + vec2(u_intensity * 0.02, 0.0)).r;
        col.b = texture2D(u_texture, uv - vec2(u_intensity * 0.02, 0.0)).b;
    }
    
    // CRT Scanlines
    if (u_scanlines > 0.01) {
        float scanline = sin(uv.y * 600.0) * 0.5 + 0.5;
        col.rgb -= scanline * u_scanlines * 0.2;
    }
    
    gl_FragColor = col;
}
"""

GLSL_OPTIC_GLOW = """
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 v_tex_coords;
uniform sampler2D u_texture;
uniform float u_radius;       // Glow radius (0.001 to 0.03)
uniform float u_threshold;    // Luminance threshold (0.0 to 1.0)
uniform float u_intensity;    // Glow brightness (0.0 to 3.0)

void main() {
    vec4 base = texture2D(u_texture, v_tex_coords);
    vec4 glow = vec4(0.0);
    
    // 8-tap exponential radial kernel
    const int SAMPLES = 8;
    float total_weight = 0.0;
    
    for (int i = 0; i < SAMPLES; i++) {
        float angle = float(i) * 6.2831853 / float(SAMPLES);
        vec2 offset = vec2(cos(angle), sin(angle)) * u_radius;
        vec4 smp = texture2D(u_texture, v_tex_coords + offset);
        
        float lum = dot(smp.rgb, vec3(0.299, 0.587, 0.114));
        if (lum > u_threshold) {
            float weight = (lum - u_threshold) / (1.0 - u_threshold + 0.001);
            glow += smp * weight;
            total_weight += 1.0;
        }
    }
    
    if (total_weight > 0.0) {
        glow /= total_weight;
    }
    
    gl_FragColor = base + glow * u_intensity;
}
"""

GLSL_CAMERA_SHAKE = """
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 v_tex_coords;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_amplitude;    // 0.0 to 0.08
uniform float u_frequency;    // 5.0 to 30.0

void main() {
    vec2 uv = v_tex_coords;
    float t = u_time * u_frequency;
    
    // Multi-frequency harmonic jitter
    float dx = sin(t * 1.1) * cos(t * 2.3) * u_amplitude;
    float dy = cos(t * 0.9) * sin(t * 1.7) * u_amplitude;
    
    // Zoom in slightly to hide black edges when shaking
    uv = (uv - 0.5) * (1.0 - u_amplitude * 2.0) + 0.5;
    uv += vec2(dx, dy);
    
    gl_FragColor = texture2D(u_texture, clamp(uv, 0.0, 1.0));
}
"""


class EffectType:
    CHROMATIC_ABERRATION = "chromatic_aberration"
    OPTIC_GLOW = "optic_glow"
    GLITCH_DISPLACEMENT = "glitch_displacement"
    CAMERA_SHAKE = "camera_shake"


class Effect:
    """Represents a compositable motion effect with animatable parameters."""
    
    METADATA = {
        EffectType.CHROMATIC_ABERRATION: {
            "name": "RGB Split & Aberration",
            "icon": "palette",
            "glsl": GLSL_CHROMATIC_ABERRATION,
            "params": {
                "amount": {"label": "Spread", "default": 0.015, "min": 0.0, "max": 0.06},
                "angle": {"label": "Angle", "default": 0.0, "min": 0.0, "max": 6.283},
            }
        },
        EffectType.OPTIC_GLOW: {
            "name": "Optic Deep Glow",
            "icon": "flare",
            "glsl": GLSL_OPTIC_GLOW,
            "params": {
                "radius": {"label": "Radius", "default": 0.012, "min": 0.001, "max": 0.04},
                "threshold": {"label": "Threshold", "default": 0.35, "min": 0.0, "max": 0.9},
                "intensity": {"label": "Intensity", "default": 1.5, "min": 0.1, "max": 4.0},
            }
        },
        EffectType.GLITCH_DISPLACEMENT: {
            "name": "Cyber Glitch & Scanline",
            "icon": "television-shattered",
            "glsl": GLSL_GLITCH_DISPLACEMENT,
            "params": {
                "intensity": {"label": "Glitch Force", "default": 0.4, "min": 0.0, "max": 1.0},
                "scanlines": {"label": "Scanlines", "default": 0.6, "min": 0.0, "max": 1.0},
            }
        },
        EffectType.CAMERA_SHAKE: {
            "name": "Dynamic Twitch / Shake",
            "icon": "vibrate",
            "glsl": GLSL_CAMERA_SHAKE,
            "params": {
                "amplitude": {"label": "Amplitude", "default": 0.03, "min": 0.0, "max": 0.08},
                "frequency": {"label": "Frequency", "default": 18.0, "min": 1.0, "max": 40.0},
            }
        }
    }

    def __init__(self, effect_type: str, enabled: bool = True):
        if effect_type not in self.METADATA:
            raise ValueError(f"Unknown effect type: {effect_type}")
        
        self.effect_type = effect_type
        meta = self.METADATA[effect_type]
        self.name = meta["name"]
        self.enabled = enabled
        self.glsl = meta["glsl"]
        
        # Instantiate animatable properties
        self.properties: Dict[str, AnimatableProperty] = {}
        for p_name, p_info in meta["params"].items():
            self.properties[p_name] = AnimatableProperty(p_name, p_info["default"])

    def get_uniforms(self, time: float) -> Dict[str, Any]:
        """Extract uniform values for the shader at the given timeline time."""
        uniforms = {"u_time": float(time)}
        for p_name, prop in self.properties.items():
            uniform_key = f"u_{p_name}"
            uniforms[uniform_key] = prop.get_value(time)
        return uniforms

    def to_dict(self) -> dict:
        return {
            "effect_type": self.effect_type,
            "enabled": self.enabled,
            "properties": {k: v.to_dict() for k, v in self.properties.items()}
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Effect':
        eff = cls(data["effect_type"], enabled=data.get("enabled", True))
        for p_name, p_data in data.get("properties", {}).items():
            eff.properties[p_name] = AnimatableProperty.from_dict(p_data)
        return eff
