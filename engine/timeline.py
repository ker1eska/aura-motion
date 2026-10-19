"""
Timeline and Multi-Layer Composition Engine.
Manages layers, transform matrices, keyframed properties, effects hierarchy,
and project serialization.
"""

import uuid
import json
from typing import List, Optional, Dict, Any
from engine.keyframes import AnimatableProperty
from engine.effects import Effect
from engine.text_engine import TextAnimationPreset


class LayerType:
    TEXT = "text"
    MEDIA = "media"
    SOLID = "solid"
    ADJUSTMENT = "adjustment"


class Layer:
    def __init__(
        self,
        name: str,
        layer_type: str,
        start_time: float = 0.0,
        end_time: float = 5.0,
        layer_id: Optional[str] = None
    ):
        self.id = layer_id or str(uuid.uuid4())[:8]
        self.name = name
        self.layer_type = layer_type
        self.start_time = float(start_time)
        self.end_time = float(end_time)
        self.visible = True
        self.locked = False

        # Core Transform Properties (All Animatable)
        self.pos_x = AnimatableProperty("pos_x", 0.0)      # Pixel offset from center
        self.pos_y = AnimatableProperty("pos_y", 0.0)
        self.scale_x = AnimatableProperty("scale_x", 1.0)
        self.scale_y = AnimatableProperty("scale_y", 1.0)
        self.rotation = AnimatableProperty("rotation", 0.0) # In degrees
        self.opacity = AnimatableProperty("opacity", 1.0)   # 0.0 to 1.0

        # Layer specific attributes
        self.text_content = "NEON MOTION"
        self.font_size = 48.0
        self.text_preset = TextAnimationPreset.STAGGER_POP
        self.color = (0.0, 0.95, 1.0, 1.0)  # Neon Cyan default
        self.media_source = ""               # Filepath for media / image

        # Shader Effect Chain applied to this layer
        self.effects: List[Effect] = []

    def is_active_at(self, time: float) -> bool:
        return self.visible and (self.start_time <= time <= self.end_time)

    def get_transform_at(self, time: float) -> Dict[str, float]:
        return {
            "pos_x": self.pos_x.get_value(time),
            "pos_y": self.pos_y.get_value(time),
            "scale_x": self.scale_x.get_value(time),
            "scale_y": self.scale_y.get_value(time),
            "rotation": self.rotation.get_value(time),
            "opacity": self.opacity.get_value(time),
        }

    def add_effect(self, effect_type: str) -> Effect:
        eff = Effect(effect_type)
        self.effects.append(eff)
        return eff

    def remove_effect(self, effect_type: str):
        self.effects = [e for e in self.effects if e.effect_type != effect_type]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "layer_type": self.layer_type,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "visible": self.visible,
            "locked": self.locked,
            "text_content": self.text_content,
            "font_size": self.font_size,
            "text_preset": self.text_preset,
            "color": list(self.color),
            "media_source": self.media_source,
            "transforms": {
                "pos_x": self.pos_x.to_dict(),
                "pos_y": self.pos_y.to_dict(),
                "scale_x": self.scale_x.to_dict(),
                "scale_y": self.scale_y.to_dict(),
                "rotation": self.rotation.to_dict(),
                "opacity": self.opacity.to_dict(),
            },
            "effects": [e.to_dict() for e in self.effects]
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Layer':
        layer = cls(
            name=data["name"],
            layer_type=data["layer_type"],
            start_time=data["start_time"],
            end_time=data["end_time"],
            layer_id=data["id"]
        )
        layer.visible = data.get("visible", True)
        layer.locked = data.get("locked", False)
        layer.text_content = data.get("text_content", "")
        layer.font_size = data.get("font_size", 48.0)
        layer.text_preset = data.get("text_preset", TextAnimationPreset.STAGGER_POP)
        layer.color = tuple(data.get("color", [1, 1, 1, 1]))
        layer.media_source = data.get("media_source", "")

        transforms = data.get("transforms", {})
        if "pos_x" in transforms:
            layer.pos_x = AnimatableProperty.from_dict(transforms["pos_x"])
        if "pos_y" in transforms:
            layer.pos_y = AnimatableProperty.from_dict(transforms["pos_y"])
        if "scale_x" in transforms:
            layer.scale_x = AnimatableProperty.from_dict(transforms["scale_x"])
        if "scale_y" in transforms:
            layer.scale_y = AnimatableProperty.from_dict(transforms["scale_y"])
        if "rotation" in transforms:
            layer.rotation = AnimatableProperty.from_dict(transforms["rotation"])
        if "opacity" in transforms:
            layer.opacity = AnimatableProperty.from_dict(transforms["opacity"])

        layer.effects = [Effect.from_dict(ed) for ed in data.get("effects", [])]
        return layer


class Composition:
    """The central project model containing all timeline tracks and layers."""
    
    def __init__(
        self,
        name: str = "Neon Project",
        width: int = 1080,
        height: int = 1920,
        fps: int = 60,
        duration: float = 6.0
    ):
        self.name = name
        self.width = width
        self.height = height
        self.fps = fps
        self.duration = float(duration)
        self.current_time = 0.0
        self.is_playing = False
        self.layers: List[Layer] = []
        self.selected_layer_id: Optional[str] = None

    def add_layer(self, layer: Layer) -> Layer:
        self.layers.insert(0, layer) # Top of stack
        self.selected_layer_id = layer.id
        return layer

    def get_selected_layer(self) -> Optional[Layer]:
        for layer in self.layers:
            if layer.id == self.selected_layer_id:
                return layer
        return self.layers[0] if self.layers else None

    def delete_layer(self, layer_id: str):
        self.layers = [l for l in self.layers if l.id != layer_id]
        if self.selected_layer_id == layer_id:
            self.selected_layer_id = self.layers[0].id if self.layers else None

    def set_time(self, time: float):
        self.current_time = max(0.0, min(self.duration, time))

    def step_forward(self):
        delta = 1.0 / self.fps
        self.set_time(self.current_time + delta)

    def step_backward(self):
        delta = 1.0 / self.fps
        self.set_time(self.current_time - delta)

    def format_timecode(self, t: Optional[float] = None) -> str:
        t = self.current_time if t is None else t
        total_frames = int(t * self.fps)
        frames = total_frames % self.fps
        seconds = int(t) % 60
        minutes = int(t / 60)
        return f"{minutes:02d}:{seconds:02d}:{frames:02d}"

    def to_json(self) -> str:
        return json.dumps({
            "name": self.name,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "duration": self.duration,
            "layers": [l.to_dict() for l in self.layers]
        }, indent=2)

    @classmethod
    def from_json(cls, json_str: str) -> 'Composition':
        data = json.loads(json_str)
        comp = cls(
            name=data.get("name", "Untitled"),
            width=data.get("width", 1080),
            height=data.get("height", 1920),
            fps=data.get("fps", 60),
            duration=data.get("duration", 6.0)
        )
        comp.layers = [Layer.from_dict(ld) for ld in data.get("layers", [])]
        if comp.layers:
            comp.selected_layer_id = comp.layers[0].id
        return comp
