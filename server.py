"""
Backend Server and Frame Renderer for AURA Motion FX Studio.
Provides project state persistence and Python offline rendering pipeline.
"""

import os
import json
from flask import Flask, jsonify, request, send_from_directory
from engine.timeline import Composition, Layer, LayerType
from engine.easing import EasingCurves

app = Flask(__name__, static_folder="ui/static", static_url_path="")
current_composition = Composition(name="Neon Master", width=1080, height=1920, fps=60, duration=5.0)

# Default Project Setup
bg_layer = current_composition.add_layer(Layer("Background", LayerType.SOLID, 0.0, 5.0))
bg_layer.color = (0.04, 0.05, 0.06, 1.0)

txt_layer = current_composition.add_layer(Layer("AURA // MOTION", LayerType.TEXT, 0.0, 5.0))
txt_layer.text_content = "AURA // MOTION"
txt_layer.pos_y.set_static(-20.0)
txt_layer.scale_x.add_keyframe(0.0, 0.2, EasingCurves.OVERSHOOT)
txt_layer.scale_x.add_keyframe(1.2, 1.0, EasingCurves.EASY_EASE)
txt_layer.add_effect("optic_glow")
txt_layer.add_effect("chromatic_aberration")


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/project", methods=["GET"])
def get_project():
    return current_composition.to_json(), 200, {"Content-Type": "application/json"}


@app.route("/api/project", methods=["POST"])
def update_project():
    global current_composition
    data = request.get_json(force=True)
    current_composition = Composition.from_json(json.dumps(data))
    return jsonify({"status": "saved", "layers_count": len(current_composition.layers)})


@app.route("/api/evaluate_easing", methods=["POST"])
def evaluate_easing():
    data = request.get_json(force=True)
    t = float(data.get("t", 0.0))
    curve = data.get("curve", EasingCurves.EASY_EASE)
    val = EasingCurves.evaluate(t, curve)
    return jsonify({"t": t, "curve": curve, "result": val})


def start_server(host="127.0.0.1", port=8080):
    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == "__main__":
    start_server()
