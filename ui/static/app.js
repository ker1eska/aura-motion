// AURA MOTION FX STUDIO - CLIENT ENGINE & SHADER PIPELINE

class MotionStudio {
  constructor() {
    this.canvas = document.getElementById('viewport-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.rulerCanvas = document.getElementById('ruler-canvas');
    this.rulerCtx = this.rulerCanvas.getContext('2d');
    this.graphCanvas = document.getElementById('graph-editor-canvas');
    this.graphCtx = this.graphCanvas.getContext('2d');

    // Composition Specs
    this.aspectRatio = "9:16";
    this.fps = 60;
    this.duration = 5.0; // seconds
    this.currentTime = 0.0;
    this.isPlaying = false;
    this.isLooping = true;
    this.lastFrameTime = performance.now();
    this.zoom = 1.0;

    // Project Layers
    this.layers = [
      {
        id: "l_bg",
        name: "Solid Background",
        type: "solid",
        startTime: 0.0,
        endTime: 5.0,
        color: "#0a0c10",
        posX: 0, posY: 0, scale: 1.0, rotation: 0, opacity: 1.0,
        keyframes: {},
        effects: []
      },
      {
        id: "l_text_main",
        name: "AURA // MOTION",
        type: "text",
        text: "AURA // MOTION",
        color: "#00f0ff",
        fontSize: 38,
        preset: "stagger_pop",
        startTime: 0.0,
        endTime: 5.0,
        posX: 0, posY: -20, scale: 1.0, rotation: 0, opacity: 1.0,
        keyframes: {
          scale: [
            { time: 0.0, val: 0.2, curve: "overshoot" },
            { time: 1.2, val: 1.0, curve: "easy_ease" }
          ],
          rotation: [
            { time: 0.0, val: -15, curve: "overshoot" },
            { time: 1.2, val: 0, curve: "easy_ease" }
          ]
        },
        effects: [
          { type: "optic_glow", name: "Optic Deep Glow", params: { radius: 0.015, threshold: 0.2, intensity: 1.8 } },
          { type: "chromatic_aberration", name: "RGB Split & Aberration", params: { amount: 0.012, angle: 0.78 } }
        ]
      },
      {
        id: "l_text_sub",
        name: "AFTER EFFECTS iOS",
        type: "text",
        text: "AFTER EFFECTS iOS",
        color: "#a855f7",
        fontSize: 16,
        preset: "kinetic_wave",
        startTime: 0.5,
        endTime: 5.0,
        posX: 0, posY: 50, scale: 1.0, rotation: 0, opacity: 1.0,
        keyframes: {},
        effects: []
      }
    ];

    this.selectedLayerId = "l_text_main";
    this.selectedCurve = "overshoot";

    this.initViewportDimensions();
    this.setupEventListeners();
    this.renderTimelineUI();
    this.renderActiveFX();
    this.renderGraphCurve();
    
    // Start Animation Loop
    requestAnimationFrame((t) => this.renderLoop(t));
  }

  initViewportDimensions() {
    const wrapper = document.getElementById('canvas-wrapper');
    const container = document.getElementById('viewport-section');
    const maxW = container.clientWidth - 40;
    const maxH = container.clientHeight - 40;

    let targetW = 320;
    let targetH = 568; // 9:16 mobile portrait

    if (this.aspectRatio === "16:9") {
      targetW = Math.min(maxW, 580);
      targetH = targetW * (9 / 16);
    } else if (this.aspectRatio === "1:1") {
      targetW = Math.min(maxW, maxH, 400);
      targetH = targetW;
    } else {
      // 9:16
      targetH = Math.min(maxH, 480);
      targetW = targetH * (9 / 16);
    }

    this.canvas.width = targetW;
    this.canvas.height = targetH;
    this.canvas.style.width = `${targetW}px`;
    this.canvas.style.height = `${targetH}px`;

    // Ruler canvas
    this.rulerCanvas.width = this.rulerCanvas.parentElement.clientWidth;
    this.rulerCanvas.height = 26;
  }

  getSelectedLayer() {
    return this.layers.find(l => l.id === this.selectedLayerId) || this.layers[0];
  }

  // --- EASING SOLVER (CUBIC BEZIER) ---
  solveBezier(t, p1x, p1y, p2x, p2y) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      let x = 3 * p1x * u * (1 - u) * (1 - u) + 3 * p2x * u * u * (1 - u) + u * u * u - t;
      if (Math.abs(x) < 0.001) break;
      let dx = 3 * p1x * (1 - u) * (1 - u) - 6 * p1x * u * (1 - u) + 6 * p2x * u * (1 - u) - 3 * p2x * u * u + 3 * u * u;
      if (Math.abs(dx) < 1e-6) break;
      u -= x / dx;
    }
    return 3 * p1y * u * (1 - u) * (1 - u) + 3 * p2y * u * u * (1 - u) + u * u * u;
  }

  evaluateCurve(t, curveType) {
    t = Math.max(0, Math.min(1, t));
    switch (curveType) {
      case "linear": return t;
      case "easy_ease": return this.solveBezier(t, 0.25, 0.1, 0.25, 1.0);
      case "expo_out": return this.solveBezier(t, 0.16, 1.0, 0.3, 1.0);
      case "overshoot": return this.solveBezier(t, 0.34, 1.56, 0.64, 1.0);
      case "bounce":
        if (t < (1 / 2.75)) return 7.5625 * t * t;
        else if (t < (2 / 2.75)) { t -= (1.5 / 2.75); return 7.5625 * t * t + 0.75; }
        else if (t < (2.5 / 2.75)) { t -= (2.25 / 2.75); return 7.5625 * t * t + 0.9375; }
        else { t -= (2.625 / 2.75); return 7.5625 * t * t + 0.984375; }
      default: return this.solveBezier(t, 0.25, 0.1, 0.25, 1.0);
    }
  }

  getInterpolatedProp(layer, propName, time) {
    const kfs = layer.keyframes && layer.keyframes[propName];
    if (!kfs || kfs.length === 0) return layer[propName];

    if (kfs.length === 1 || time <= kfs[0].time) return kfs[0].val;
    if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].val;

    for (let i = 0; i < kfs.length - 1; i++) {
      let k1 = kfs[i];
      let k2 = kfs[i + 1];
      if (k1.time <= time && time <= k2.time) {
        let span = k2.time - k1.time;
        let alpha = (time - k1.time) / span;
        let easedAlpha = this.evaluateCurve(alpha, k1.curve || "easy_ease");
        return k1.val + (k2.val - k1.val) * easedAlpha;
      }
    }
    return layer[propName];
  }

  // --- MAIN 60 FPS RENDER LOOP ---
  renderLoop(now) {
    const dt = (now - this.lastFrameTime) / 1000.0;
    this.lastFrameTime = now;

    if (this.isPlaying) {
      this.currentTime += dt;
      if (this.currentTime >= this.duration) {
        if (this.isLooping) {
          this.currentTime = 0.0;
        } else {
          this.currentTime = this.duration;
          this.setPlaying(false);
        }
      }
      this.updatePlayheadUI();
    }

    // Render Canvas
    this.renderComposition(this.currentTime);

    requestAnimationFrame((t) => this.renderLoop(t));
  }

  renderComposition(time) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Render each active layer in order (bottom to top)
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (time < layer.startTime || time > layer.endTime) continue;

      ctx.save();

      // Transform calculation
      const posX = this.getInterpolatedProp(layer, 'posX', time);
      const posY = this.getInterpolatedProp(layer, 'posY', time);
      const scale = this.getInterpolatedProp(layer, 'scale', time);
      const rot = this.getInterpolatedProp(layer, 'rotation', time);
      const opacity = this.getInterpolatedProp(layer, 'opacity', time);

      ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      ctx.translate(cx + posX, cy + posY);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(scale, scale);

      // Render layer content
      if (layer.type === "solid") {
        ctx.fillStyle = layer.color;
        ctx.fillRect(-w / 2, -h / 2, w, h);
      } else if (layer.type === "text") {
        this.renderKineticText(ctx, layer, time - layer.startTime);
      }

      ctx.restore();
    }

    // Post-Processing Shader / FX Simulation Pass
    this.applyPostFX(ctx, w, h, time);

    ctx.restore();
  }

  // --- KINETIC TYPOGRAPHY RENDERER ---
  renderKineticText(ctx, layer, localTime) {
    const text = layer.text || "";
    const chars = text.split("");
    const preset = layer.preset || "stagger_pop";
    const fontSize = layer.fontSize || 32;

    ctx.font = `800 ${fontSize}px 'Outfit', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Measure character widths
    const charMetrics = chars.map(c => ctx.measureText(c).width);
    const totalWidth = charMetrics.reduce((a, b) => a + b, 0);
    let startX = -totalWidth / 2;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const charW = charMetrics[i];
      const charCenterX = startX + charW / 2;
      startX += charW;

      ctx.save();
      const staggerDelay = 0.06;
      const charT = Math.max(0, localTime - i * staggerDelay);

      let dy = 0, chScale = 1.0, chRot = 0, chAlpha = 1.0;

      if (preset === "stagger_pop") {
        const p = Math.min(1.0, charT / 0.55);
        const eased = this.evaluateCurve(p, "overshoot");
        dy = (1.0 - eased) * 50;
        chScale = Math.max(0, eased);
        chRot = (1.0 - eased) * (i % 2 === 0 ? 12 : -12);
        chAlpha = Math.min(1.0, charT / 0.2);
      } else if (preset === "kinetic_wave") {
        const phase = localTime * 5.0 - i * 0.4;
        dy = Math.sin(phase) * 14;
        chRot = Math.cos(phase) * 6;
        chScale = 1.0 + Math.sin(phase) * 0.1;
      } else if (preset === "neon_typewriter") {
        if (charT <= 0) { ctx.restore(); continue; }
        const flash = Math.min(1.0, charT / 0.15);
        chScale = 1.0 + (1.0 - flash) * 0.4;
      } else if (preset === "glitch_scatter") {
        const p = Math.min(1.0, charT / 0.7);
        if (p < 1.0) {
          const jitter = 1.0 - p;
          dy = Math.sin(localTime * 15 + i * 20) * 20 * jitter;
          chRot = Math.cos(localTime * 20 + i) * 25 * jitter;
          chScale = 1.0 + jitter * 0.5;
        }
      } else if (preset === "expo_zoom") {
        const p = Math.min(1.0, charT / 0.6);
        const eased = this.evaluateCurve(p, "expo_out");
        chScale = 0.2 + 0.8 * eased;
        chAlpha = Math.min(1.0, charT / 0.25);
      }

      ctx.translate(charCenterX, dy);
      ctx.rotate((chRot * Math.PI) / 180);
      ctx.scale(chScale, chScale);
      ctx.globalAlpha = Math.max(0, Math.min(1, chAlpha));

      // Dual pass: Neon ambient glow + Crisp Core
      ctx.shadowColor = layer.color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = layer.color;
      ctx.fillText(ch, 0, 0);

      ctx.shadowBlur = 4;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(ch, 0, 0);

      ctx.restore();
    }
  }

  // --- POST FX PIPELINE (GLOW, CHROMATIC, GLITCH, SHAKE) ---
  applyPostFX(ctx, w, h, time) {
    const selLayer = this.getSelectedLayer();
    if (!selLayer || !selLayer.effects) return;

    for (let eff of selLayer.effects) {
      if (eff.type === "chromatic_aberration") {
        const amount = eff.params.amount * 50; // offset in px
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        // Red shift
        ctx.fillStyle = "rgba(255, 0, 80, 0.12)";
        ctx.fillRect(-amount, 0, w, h);
        // Cyan shift
        ctx.fillStyle = "rgba(0, 240, 255, 0.12)";
        ctx.fillRect(amount, 0, w, h);
        ctx.restore();
      } else if (eff.type === "glitch_displacement") {
        const intensity = eff.params.intensity;
        if (Math.random() < intensity * 0.35) {
          const sliceY = Math.random() * h;
          const sliceH = 10 + Math.random() * 30;
          const shiftX = (Math.random() - 0.5) * intensity * 40;
          ctx.drawImage(this.canvas, 0, sliceY, w, sliceH, shiftX, sliceY, w, sliceH);
        }
      } else if (eff.type === "camera_shake") {
        const amp = eff.params.amplitude * 100;
        const freq = eff.params.frequency;
        const dx = Math.sin(time * freq) * amp;
        const dy = Math.cos(time * freq * 1.3) * amp;
        ctx.drawImage(this.canvas, dx, dy);
      }
    }
  }

  // --- UI TIMELINE & RULER ---
  renderTimelineUI() {
    this.renderRuler();
    const list = document.getElementById('tracks-list');
    list.innerHTML = "";

    this.layers.forEach((layer) => {
      const row = document.createElement('div');
      row.className = `track-row ${layer.id === this.selectedLayerId ? 'selected' : ''}`;
      row.onclick = () => this.selectLayer(layer.id);

      const colorPill = document.createElement('div');
      colorPill.className = 'track-color-pill';
      colorPill.style.background = layer.color || '#00f0ff';

      const name = document.createElement('div');
      name.className = 'track-name';
      name.textContent = layer.name;

      const barContainer = document.createElement('div');
      barContainer.className = 'track-bar-container';

      const fill = document.createElement('div');
      fill.className = 'track-bar-fill';
      const leftPct = (layer.startTime / this.duration) * 100;
      const widthPct = ((layer.endTime - layer.startTime) / this.duration) * 100;
      fill.style.left = `${leftPct}%`;
      fill.style.width = `${widthPct}%`;

      // Render Keyframe Diamonds
      if (layer.keyframes) {
        Object.keys(layer.keyframes).forEach(prop => {
          layer.keyframes[prop].forEach(kf => {
            const diamond = document.createElement('div');
            diamond.className = 'kf-marker';
            const kfPct = (kf.time / this.duration) * 100;
            diamond.style.left = `${kfPct}%`;
            diamond.title = `${prop}: ${kf.val} (${kf.curve})`;
            barContainer.appendChild(diamond);
          });
        });
      }

      barContainer.appendChild(fill);
      row.appendChild(colorPill);
      row.appendChild(name);
      row.appendChild(barContainer);
      list.appendChild(row);
    });

    this.updateGizmo();
    this.updateTransformInputs();
  }

  renderRuler() {
    const rc = this.rulerCtx;
    const w = this.rulerCanvas.width;
    const h = this.rulerCanvas.height;
    rc.clearRect(0, 0, w, h);

    rc.fillStyle = "#1e2330";
    rc.fillRect(0, 0, w, h);

    const stepSec = 1.0;
    const totalSec = this.duration;
    rc.font = "9px 'JetBrains Mono', monospace";
    rc.fillStyle = "#6b7280";

    for (let s = 0; s <= totalSec; s += stepSec) {
      const x = (s / totalSec) * w;
      rc.fillRect(x, 12, 1, h - 12);
      rc.fillText(`${s}s`, x + 4, 10);
    }
  }

  updatePlayheadUI() {
    const pct = (this.currentTime / this.duration) * 100;
    const playhead = document.getElementById('playhead-cursor');
    if (playhead) {
      playhead.style.left = `${pct}%`;
    }

    // Update Timecode
    const totalFrames = Math.floor(this.currentTime * this.fps);
    const frames = totalFrames % this.fps;
    const secs = Math.floor(this.currentTime) % 60;
    const mins = Math.floor(this.currentTime / 60);
    const tcStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
    document.getElementById('timecode-val').textContent = tcStr;
  }

  // --- GRAPH CURVE EDITOR CANVAS ---
  renderGraphCurve() {
    const gc = this.graphCtx;
    const w = this.graphCanvas.width;
    const h = this.graphCanvas.height;
    gc.clearRect(0, 0, w, h);

    // Draw background grid
    gc.strokeStyle = "#1f2430";
    gc.lineWidth = 1;
    for (let x = 0; x <= w; x += 35) {
      gc.beginPath(); gc.moveTo(x, 0); gc.lineTo(x, h); gc.stroke();
    }
    for (let y = 0; y <= h; y += 30) {
      gc.beginPath(); gc.moveTo(0, y); gc.lineTo(w, y); gc.stroke();
    }

    // Draw Bezier speed curve
    gc.beginPath();
    gc.strokeStyle = "#00f0ff";
    gc.lineWidth = 2.5;
    gc.shadowColor = "#00f0ff";
    gc.shadowBlur = 10;

    for (let px = 0; px <= w; px += 2) {
      const t = px / w;
      const v = this.evaluateCurve(t, this.selectedCurve);
      const py = h - (v * (h - 40) + 20);
      if (px === 0) gc.moveTo(px, py);
      else gc.lineTo(px, py);
    }
    gc.stroke();
    gc.shadowBlur = 0;
  }

  // --- FX PANEL RENDERING ---
  renderActiveFX() {
    const container = document.getElementById('active-fx-list');
    container.innerHTML = "";
    const layer = this.getSelectedLayer();
    if (!layer || !layer.effects) return;

    layer.effects.forEach((eff, idx) => {
      const card = document.createElement('div');
      card.className = 'fx-card';

      const header = document.createElement('div');
      header.className = 'fx-card-header';
      header.innerHTML = `
        <span class="fx-name">${eff.name}</span>
        <button class="icon-btn" style="color:#ef4444;" onclick="studio.removeEffect(${idx})">&times;</button>
      `;
      card.appendChild(header);

      Object.keys(eff.params).forEach(pName => {
        const row = document.createElement('div');
        row.className = 'fx-param-row';
        row.innerHTML = `
          <span class="fx-param-label">${pName.toUpperCase()}</span>
          <input type="range" class="fx-param-slider" min="0" max="1" step="0.01" value="${eff.params[pName]}">
          <span class="fx-param-val">${eff.params[pName]}</span>
        `;
        const slider = row.querySelector('.fx-param-slider');
        const valSpan = row.querySelector('.fx-param-val');
        slider.oninput = (e) => {
          eff.params[pName] = parseFloat(e.target.value);
          valSpan.textContent = eff.params[pName];
        };
        card.appendChild(row);
      });

      container.appendChild(card);
    });
  }

  removeEffect(idx) {
    const layer = this.getSelectedLayer();
    if (layer && layer.effects) {
      layer.effects.splice(idx, 1);
      this.renderActiveFX();
    }
  }

  addSelectedEffect() {
    const layer = this.getSelectedLayer();
    const sel = document.getElementById('fx-selector');
    const effType = sel.value;

    const effDefs = {
      optic_glow: { type: "optic_glow", name: "Optic Deep Glow", params: { radius: 0.015, threshold: 0.25, intensity: 1.8 } },
      chromatic_aberration: { type: "chromatic_aberration", name: "RGB Split & Aberration", params: { amount: 0.015, angle: 0.0 } },
      glitch_displacement: { type: "glitch_displacement", name: "Cyber Glitch & Scanline", params: { intensity: 0.45, scanlines: 0.7 } },
      camera_shake: { type: "camera_shake", name: "Dynamic Twitch / Shake", params: { amplitude: 0.04, frequency: 18.0 } }
    };

    if (layer && effDefs[effType]) {
      layer.effects.push(JSON.parse(JSON.stringify(effDefs[effType])));
      this.renderActiveFX();
    }
  }

  selectLayer(layerId) {
    this.selectedLayerId = layerId;
    this.renderTimelineUI();
    this.renderActiveFX();
    const layer = this.getSelectedLayer();
    if (layer && layer.type === "text") {
      document.getElementById('text-input-field').value = layer.text || "";
    }
  }

  updateGizmo() {
    const gizmo = document.getElementById('gizmo-overlay');
    const layer = this.getSelectedLayer();
    if (!layer) {
      gizmo.classList.add('hidden');
      return;
    }
    gizmo.classList.remove('hidden');
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const gw = 180 * layer.scale;
    const gh = 70 * layer.scale;
    gizmo.style.width = `${gw}px`;
    gizmo.style.height = `${gh}px`;
    gizmo.style.left = `${cx + layer.posX - gw / 2}px`;
    gizmo.style.top = `${cy + layer.posY - gh / 2}px`;
    gizmo.style.transform = `rotate(${layer.rotation}deg)`;
  }

  updateTransformInputs() {
    const layer = this.getSelectedLayer();
    if (!layer) return;
    document.getElementById('slider-pos-x').value = layer.posX;
    document.getElementById('val-pos-x').textContent = `${Math.round(layer.posX)}px`;
    document.getElementById('slider-pos-y').value = layer.posY;
    document.getElementById('val-pos-y').textContent = `${Math.round(layer.posY)}px`;
    document.getElementById('slider-scale').value = layer.scale;
    document.getElementById('val-scale').textContent = `${layer.scale.toFixed(2)}x`;
    document.getElementById('slider-rot').value = layer.rotation;
    document.getElementById('val-rot').textContent = `${Math.round(layer.rotation)}°`;
    document.getElementById('slider-opacity').value = layer.opacity;
    document.getElementById('val-opacity').textContent = `${Math.round(layer.opacity * 100)}%`;
  }

  setPlaying(state) {
    this.isPlaying = state;
    document.getElementById('icon-play').classList.toggle('hidden', state);
    document.getElementById('icon-pause').classList.toggle('hidden', !state);
  }

  setupEventListeners() {
    // Playback
    document.getElementById('btn-play-pause').onclick = () => this.setPlaying(!this.isPlaying);
    document.getElementById('btn-prev-frame').onclick = () => {
      this.currentTime = Math.max(0, this.currentTime - 1.0 / this.fps);
      this.updatePlayheadUI();
    };
    document.getElementById('btn-next-frame').onclick = () => {
      this.currentTime = Math.min(this.duration, this.currentTime + 1.0 / this.fps);
      this.updatePlayheadUI();
    };
    document.getElementById('btn-loop-toggle').onclick = (e) => {
      this.isLooping = !this.isLooping;
      e.currentTarget.style.color = this.isLooping ? "#00f0ff" : "#6b7280";
    };

    // Ruler scrub
    const ruler = document.getElementById('ruler-container');
    const handleRulerScrub = (e) => {
      const rect = ruler.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      this.currentTime = (x / rect.width) * this.duration;
      this.updatePlayheadUI();
    };
    ruler.addEventListener('mousedown', (e) => {
      handleRulerScrub(e);
      const onMove = (ev) => handleRulerScrub(ev);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    ruler.addEventListener('touchstart', handleRulerScrub);
    ruler.addEventListener('touchmove', handleRulerScrub);

    // Dock Tabs
    document.querySelectorAll('.dock-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.dock-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panelId = tab.dataset.tab;
        document.getElementById(panelId).classList.add('active');
        if (panelId === 'tab-graph') this.renderGraphCurve();
      };
    });

    // Kinetic Text Input & Presets
    document.getElementById('text-input-field').oninput = (e) => {
      const layer = this.getSelectedLayer();
      if (layer && layer.type === "text") {
        layer.text = e.target.value;
      }
    };
    document.querySelectorAll('.preset-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const layer = this.getSelectedLayer();
        if (layer && layer.type === "text") {
          layer.preset = pill.dataset.preset;
        }
      };
    });

    // Curves Presets
    document.querySelectorAll('.curve-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.curve-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCurve = btn.dataset.curve;
        this.renderGraphCurve();
      };
    });

    // Add FX Button
    document.getElementById('btn-add-fx').onclick = () => this.addSelectedEffect();

    // Transform Sliders
    const linkSlider = (id, prop, transformFn, unit) => {
      document.getElementById(id).oninput = (e) => {
        const layer = this.getSelectedLayer();
        if (!layer) return;
        layer[prop] = transformFn(parseFloat(e.target.value));
        this.updateTransformInputs();
        this.updateGizmo();
      };
    };
    linkSlider('slider-pos-x', 'posX', v => v, 'px');
    linkSlider('slider-pos-y', 'posY', v => v, 'px');
    linkSlider('slider-scale', 'scale', v => v, 'x');
    linkSlider('slider-rot', 'rotation', v => v, '°');
    linkSlider('slider-opacity', 'opacity', v => v, '%');

    // Add Keyframe Button
    document.getElementById('btn-add-kf').onclick = () => {
      const layer = this.getSelectedLayer();
      if (!layer) return;
      if (!layer.keyframes) layer.keyframes = {};
      if (!layer.keyframes.scale) layer.keyframes.scale = [];
      layer.keyframes.scale.push({
        time: parseFloat(this.currentTime.toFixed(2)),
        val: layer.scale,
        curve: this.selectedCurve
      });
      layer.keyframes.scale.sort((a, b) => a.time - b.time);
      this.renderTimelineUI();
    };

    // Add Layer Buttons
    document.getElementById('btn-add-text-layer').onclick = () => {
      const newId = `l_txt_${Date.now()}`;
      this.layers.push({
        id: newId,
        name: "New Kinetic Text",
        type: "text",
        text: "NEW MOTION",
        color: "#ffffff",
        fontSize: 32,
        preset: "stagger_pop",
        startTime: this.currentTime,
        endTime: this.duration,
        posX: 0, posY: 0, scale: 1.0, rotation: 0, opacity: 1.0,
        keyframes: {},
        effects: []
      });
      this.selectLayer(newId);
    };

    // Aspect Ratio
    document.getElementById('aspect-ratio-select').onchange = (e) => {
      this.aspectRatio = e.target.value;
      this.initViewportDimensions();
      this.updateGizmo();
    };

    // Export Modal
    document.getElementById('btn-export').onclick = () => {
      document.getElementById('export-modal').classList.remove('hidden');
    };
    document.getElementById('btn-close-export').onclick = () => {
      document.getElementById('export-modal').classList.add('hidden');
    };
    document.getElementById('btn-start-render').onclick = () => this.simulateExport();

    window.onresize = () => {
      this.initViewportDimensions();
      this.renderRuler();
      this.updateGizmo();
    };
  }

  simulateExport() {
    const bar = document.getElementById('export-progress-bar');
    const status = document.getElementById('export-status-text');
    let pct = 0;
    const interval = setInterval(() => {
      pct += 4;
      bar.style.width = `${pct}%`;
      status.textContent = `Рендеринг кадров: ${pct}% (MP4 H.264 / ProMotion 60 FPS)`;
      if (pct >= 100) {
        clearInterval(interval);
        status.textContent = `Готово! Видео отрендерено в 4K 60 FPS.`;
      }
    }, 60);
  }
}

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  window.studio = new MotionStudio();
});
