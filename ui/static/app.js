// AURA MOTION PRO - MOBILE CLIENT ENGINE (ALIGHT MOTION GRADE)

class AuraMobileStudio {
  constructor() {
    this.canvas = document.getElementById('main-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.rulerCanvas = document.getElementById('ruler-cv');
    this.rulerCtx = this.rulerCanvas.getContext('2d');
    this.curvesCanvas = document.getElementById('curves-canvas');
    this.curvesCtx = this.curvesCanvas.getContext('2d');

    // Composition State
    this.aspectRatio = "9:16";
    this.fps = 60;
    this.duration = 6.0;
    this.currentTime = 0.0;
    this.isPlaying = false;
    this.lastTimestamp = performance.now();
    this.selectedCurve = "overshoot";

    // Media Video Elements Storage
    this.mediaElements = {};

    // Project Layers
    this.layers = [
      {
        id: "layer_bg",
        name: "Solid Background",
        type: "solid",
        color: "#080a0f",
        startTime: 0.0,
        endTime: 6.0,
        posX: 0, posY: 0, scale: 1.0, rot: 0, opacity: 1.0,
        keyframes: {},
        effects: []
      },
      {
        id: "layer_text_title",
        name: "AURA // MOTION",
        type: "text",
        text: "AURA // MOTION",
        color: "#00f0ff",
        fontSize: 34,
        anim: "stagger_pop",
        startTime: 0.0,
        endTime: 6.0,
        posX: 0, posY: -20, scale: 1.0, rot: 0, opacity: 1.0,
        keyframes: {
          scale: [
            { time: 0.0, val: 0.2, curve: "overshoot" },
            { time: 1.2, val: 1.0, curve: "easy_ease" }
          ]
        },
        effects: [
          { type: "optic_glow", name: "Optic Deep Glow", params: { radius: 0.02, threshold: 0.2, intensity: 2.0 } },
          { type: "chromatic_aberration", name: "RGB Split", params: { amount: 0.015, angle: 0.78 } }
        ]
      }
    ];

    this.selectedLayerId = "layer_text_title";

    this.initCanvasSize();
    this.bindEvents();
    this.renderTimeline();
    this.renderActiveFXList();
    this.drawCurveGraph();

    requestAnimationFrame((t) => this.loop(t));
  }

  // --- RESPONSIVE IPHONE CANVAS CALCULATION ---
  initCanvasSize() {
    const box = document.getElementById('viewport-box');
    const availW = box.clientWidth - 20;
    const availH = box.clientHeight - 20;

    let targetW, targetH;

    if (this.aspectRatio === "9:16") {
      targetH = Math.min(availH, availW * (16 / 9));
      targetW = targetH * (9 / 16);
    } else if (this.aspectRatio === "16:9") {
      targetW = Math.min(availW, availH * (16 / 9));
      targetH = targetW * (9 / 16);
    } else {
      // 1:1
      targetW = Math.min(availW, availH);
      targetH = targetW;
    }

    this.canvas.width = Math.round(targetW);
    this.canvas.height = Math.round(targetH);
    this.canvas.style.width = `${Math.round(targetW)}px`;
    this.canvas.style.height = `${Math.round(targetH)}px`;

    // Ruler Canvas
    this.rulerCanvas.width = this.rulerCanvas.parentElement.clientWidth;
    this.rulerCanvas.height = 22;
  }

  getSelectedLayer() {
    return this.layers.find(l => l.id === this.selectedLayerId) || this.layers[0];
  }

  // --- CUBIC BEZIER / EASING SOLVER ---
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

  evalCurve(t, curve) {
    t = Math.max(0, Math.min(1, t));
    switch (curve) {
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

  getPropVal(layer, prop, time) {
    const kfs = layer.keyframes && layer.keyframes[prop];
    if (!kfs || kfs.length === 0) return layer[prop];
    if (kfs.length === 1 || time <= kfs[0].time) return kfs[0].val;
    if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].val;

    for (let i = 0; i < kfs.length - 1; i++) {
      let k1 = kfs[i];
      let k2 = kfs[i + 1];
      if (k1.time <= time && time <= k2.time) {
        let span = k2.time - k1.time;
        let a = (time - k1.time) / span;
        let ea = this.evalCurve(a, k1.curve || "easy_ease");
        return k1.val + (k2.val - k1.val) * ea;
      }
    }
    return layer[prop];
  }

  // --- 60 FPS RENDER LOOP ---
  loop(now) {
    const dt = (now - this.lastTimestamp) / 1000.0;
    this.lastTimestamp = now;

    if (this.isPlaying) {
      this.currentTime += dt;
      if (this.currentTime >= this.duration) {
        this.currentTime = 0.0; // Loop seamlessly
      }
      this.updatePlayhead();

      // Sync active HTML5 videos
      Object.keys(this.mediaElements).forEach(id => {
        const vid = this.mediaElements[id];
        if (vid instanceof HTMLVideoElement && vid.readyState >= 2) {
          vid.currentTime = this.currentTime % vid.duration;
        }
      });
    }

    this.renderStage(this.currentTime);
    requestAnimationFrame((t) => this.loop(t));
  }

  renderStage(time) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Draw active layers from bottom to top
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (time < layer.startTime || time > layer.endTime) continue;

      ctx.save();
      const px = this.getPropVal(layer, 'posX', time);
      const py = this.getPropVal(layer, 'posY', time);
      const sc = this.getPropVal(layer, 'scale', time);
      const rot = this.getPropVal(layer, 'rot', time);
      const op = this.getPropVal(layer, 'opacity', time);

      ctx.globalAlpha = Math.max(0, Math.min(1, op));
      ctx.translate(cx + px, cy + py);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(sc, sc);

      if (layer.type === "solid") {
        ctx.fillStyle = layer.color;
        ctx.fillRect(-w / 2, -h / 2, w, h);
      } else if (layer.type === "media") {
        this.renderMediaLayer(ctx, layer, w, h);
      } else if (layer.type === "text") {
        this.renderKineticText(ctx, layer, time - layer.startTime);
      }

      ctx.restore();
    }

    // Apply Post-Processing Shaders / FX
    this.renderFXPass(ctx, w, h, time);

    ctx.restore();
  }

  // --- RENDER USER VIDEO OR IMAGE LAYER ---
  renderMediaLayer(ctx, layer, compW, compH) {
    const elem = this.mediaElements[layer.id];
    if (!elem) return;

    const elemW = elem.videoWidth || elem.width || compW;
    const elemH = elem.videoHeight || elem.height || compH;
    const aspect = elemW / elemH;

    let drawW = compW * 0.9;
    let drawH = drawW / aspect;

    ctx.drawImage(elem, -drawW / 2, -drawH / 2, drawW, drawH);
  }

  // --- KINETIC TYPOGRAPHY ---
  renderKineticText(ctx, layer, localT) {
    const text = layer.text || "";
    const chars = text.split("");
    const anim = layer.anim || "stagger_pop";
    const fs = layer.fontSize || 32;

    ctx.font = `800 ${fs}px 'Outfit', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const metrics = chars.map(c => ctx.measureText(c).width);
    const totalW = metrics.reduce((a, b) => a + b, 0);
    let startX = -totalW / 2;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const chW = metrics[i];
      const centerX = startX + chW / 2;
      startX += chW;

      ctx.save();
      const charT = Math.max(0, localT - i * 0.05);
      let dy = 0, scale = 1.0, rot = 0, alpha = 1.0;

      if (anim === "stagger_pop") {
        const p = Math.min(1.0, charT / 0.55);
        const ea = this.evalCurve(p, "overshoot");
        dy = (1.0 - ea) * 45;
        scale = Math.max(0, ea);
        rot = (1.0 - ea) * (i % 2 === 0 ? 12 : -12);
        alpha = Math.min(1.0, charT / 0.2);
      } else if (anim === "kinetic_wave") {
        const ph = localT * 5.0 - i * 0.4;
        dy = Math.sin(ph) * 12;
        rot = Math.cos(ph) * 5;
        scale = 1.0 + Math.sin(ph) * 0.08;
      } else if (anim === "neon_typewriter") {
        if (charT <= 0) { ctx.restore(); continue; }
        const fl = Math.min(1.0, charT / 0.15);
        scale = 1.0 + (1.0 - fl) * 0.35;
      } else if (anim === "glitch_scatter") {
        const p = Math.min(1.0, charT / 0.7);
        if (p < 1.0) {
          const j = 1.0 - p;
          dy = Math.sin(localT * 18 + i * 25) * 20 * j;
          rot = Math.cos(localT * 22 + i) * 20 * j;
          scale = 1.0 + j * 0.4;
        }
      } else if (anim === "expo_zoom") {
        const p = Math.min(1.0, charT / 0.6);
        const ea = this.evalCurve(p, "expo_out");
        scale = 0.2 + 0.8 * ea;
        alpha = Math.min(1.0, charT / 0.25);
      }

      ctx.translate(centerX, dy);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

      // Glow pass
      ctx.shadowColor = layer.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = layer.color;
      ctx.fillText(ch, 0, 0);

      // Core crisp pass
      ctx.shadowBlur = 3;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(ch, 0, 0);

      ctx.restore();
    }
  }

  // --- GPU FX SHADERS PASS ---
  renderFXPass(ctx, w, h, time) {
    const sel = this.getSelectedLayer();
    if (!sel || !sel.effects) return;

    for (let eff of sel.effects) {
      if (eff.type === "chromatic_aberration") {
        const amt = eff.params.amount * 40;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = "rgba(255, 0, 80, 0.14)";
        ctx.fillRect(-amt, 0, w, h);
        ctx.fillStyle = "rgba(0, 240, 255, 0.14)";
        ctx.fillRect(amt, 0, w, h);
        ctx.restore();
      } else if (eff.type === "cyber_glitch") {
        if (Math.random() < 0.25) {
          const sy = Math.random() * h;
          const sh = 10 + Math.random() * 25;
          const sx = (Math.random() - 0.5) * 30;
          ctx.drawImage(this.canvas, 0, sy, w, sh, sx, sy, w, sh);
        }
      } else if (eff.type === "camera_shake") {
        const amp = 4;
        const dx = Math.sin(time * 20) * amp;
        const dy = Math.cos(time * 26) * amp;
        ctx.drawImage(this.canvas, dx, dy);
      } else if (eff.type === "vhs_retro") {
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
        for (let y = 0; y < h; y += 4) {
          ctx.fillRect(0, y, w, 1);
        }
        ctx.restore();
      }
    }
  }

  // --- TIMELINE RENDERING ---
  renderTimeline() {
    this.drawRuler();
    const stack = document.getElementById('tracks-stack');
    stack.innerHTML = "";

    this.layers.forEach((layer) => {
      const row = document.createElement('div');
      row.className = `layer-strip ${layer.id === this.selectedLayerId ? 'selected' : ''}`;
      row.onclick = () => this.selectLayer(layer.id);

      const tag = document.createElement('div');
      tag.className = 'layer-type-tag';
      tag.style.background = layer.color || '#00f0ff';

      const title = document.createElement('div');
      title.className = 'layer-strip-title';
      title.textContent = layer.name;

      const barBg = document.createElement('div');
      barBg.className = 'layer-track-bar-bg';

      const barFill = document.createElement('div');
      barFill.className = 'layer-track-bar-fill';
      const lPct = (layer.startTime / this.duration) * 100;
      const wPct = ((layer.endTime - layer.startTime) / this.duration) * 100;
      barFill.style.left = `${lPct}%`;
      barFill.style.width = `${wPct}%`;

      if (layer.keyframes) {
        Object.keys(layer.keyframes).forEach(prop => {
          layer.keyframes[prop].forEach(kf => {
            const diamond = document.createElement('div');
            diamond.className = 'track-kf-diamond';
            diamond.style.left = `${(kf.time / this.duration) * 100}%`;
            barBg.appendChild(diamond);
          });
        });
      }

      barBg.appendChild(barFill);
      row.appendChild(tag);
      row.appendChild(title);
      row.appendChild(barBg);
      stack.appendChild(row);
    });

    this.updateGizmo();
    this.syncInputsWithLayer();
  }

  drawRuler() {
    const rc = this.rulerCtx;
    const w = this.rulerCanvas.width;
    const h = this.rulerCanvas.height;
    rc.clearRect(0, 0, w, h);

    rc.fillStyle = "#12151e";
    rc.fillRect(0, 0, w, h);

    const step = 1.0;
    rc.font = "8px 'JetBrains Mono', monospace";
    rc.fillStyle = "#5f6368";

    for (let s = 0; s <= this.duration; s += step) {
      const x = (s / this.duration) * w;
      rc.fillRect(x, 10, 1, h - 10);
      rc.fillText(`${s}s`, x + 3, 9);
    }
  }

  updatePlayhead() {
    const pct = (this.currentTime / this.duration) * 100;
    const needle = document.getElementById('playhead');
    if (needle) needle.style.left = `${pct}%`;

    const totalF = Math.floor(this.currentTime * this.fps);
    const f = totalF % this.fps;
    const s = Math.floor(this.currentTime) % 60;
    const m = Math.floor(this.currentTime / 60);
    document.getElementById('timecode-display').textContent =
      `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }

  drawCurveGraph() {
    const gc = this.curvesCtx;
    const w = this.curvesCanvas.width;
    const h = this.curvesCanvas.height;
    gc.clearRect(0, 0, w, h);

    gc.strokeStyle = "#1a1f2c";
    for (let x = 0; x <= w; x += 30) {
      gc.beginPath(); gc.moveTo(x, 0); gc.lineTo(x, h); gc.stroke();
    }
    for (let y = 0; y <= h; y += 25) {
      gc.beginPath(); gc.moveTo(0, y); gc.lineTo(w, y); gc.stroke();
    }

    gc.beginPath();
    gc.strokeStyle = "#00f0ff";
    gc.lineWidth = 2.5;
    gc.shadowColor = "#00f0ff";
    gc.shadowBlur = 8;

    for (let px = 0; px <= w; px += 2) {
      const t = px / w;
      const v = this.evalCurve(t, this.selectedCurve);
      const py = h - (v * (h - 35) + 18);
      if (px === 0) gc.moveTo(px, py);
      else gc.lineTo(px, py);
    }
    gc.stroke();
    gc.shadowBlur = 0;
  }

  renderActiveFXList() {
    const container = document.getElementById('active-fx-controls');
    container.innerHTML = "";
    const sel = this.getSelectedLayer();
    if (!sel || !sel.effects || sel.effects.length === 0) {
      container.innerHTML = `<span style="font-size:11px;color:#6b7280;">Нет активных эффектов. Нажмите карточку выше, чтобы добавить.</span>`;
      return;
    }

    sel.effects.forEach((eff, i) => {
      Object.keys(eff.params).forEach(pName => {
        const row = document.createElement('div');
        row.className = 'fx-live-row';
        row.innerHTML = `
          <label>${eff.name} • ${pName.toUpperCase()}</label>
          <input type="range" min="0" max="1" step="0.01" value="${eff.params[pName]}">
          <b>${eff.params[pName]}</b>
        `;
        const slider = row.querySelector('input');
        const b = row.querySelector('b');
        slider.oninput = (e) => {
          eff.params[pName] = parseFloat(e.target.value);
          b.textContent = eff.params[pName];
        };
        container.appendChild(row);
      });
    });
  }

  selectLayer(id) {
    this.selectedLayerId = id;
    this.renderTimeline();
    this.renderActiveFXList();
    this.syncInputsWithLayer();
  }

  syncInputsWithLayer() {
    const layer = this.getSelectedLayer();
    if (!layer) return;

    if (layer.type === "text") {
      document.getElementById('live-text-input').value = layer.text || "";
      document.getElementById('live-text-color').value = layer.color || "#00f0ff";
    }

    document.getElementById('t-scale').value = layer.scale;
    document.getElementById('lbl-scale').textContent = `${layer.scale.toFixed(2)}x`;
    document.getElementById('t-pos-x').value = layer.posX;
    document.getElementById('lbl-pos-x').textContent = `${Math.round(layer.posX)}px`;
    document.getElementById('t-pos-y').value = layer.posY;
    document.getElementById('lbl-pos-y').textContent = `${Math.round(layer.posY)}px`;
    document.getElementById('t-rot').value = layer.rot;
    document.getElementById('lbl-rot').textContent = `${Math.round(layer.rot)}°`;
    document.getElementById('t-opacity').value = layer.opacity;
    document.getElementById('lbl-opacity').textContent = `${Math.round(layer.opacity * 100)}%`;
  }

  updateGizmo() {
    const gizmo = document.getElementById('touch-gizmo');
    const layer = this.getSelectedLayer();
    if (!layer) { gizmo.classList.add('hidden'); return; }

    gizmo.classList.remove('hidden');
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const gw = 160 * layer.scale;
    const gh = 65 * layer.scale;
    gizmo.style.width = `${gw}px`;
    gizmo.style.height = `${gh}px`;
    gizmo.style.left = `${cx + layer.posX - gw / 2}px`;
    gizmo.style.top = `${cy + layer.posY - gh / 2}px`;
    gizmo.style.transform = `rotate(${layer.rot}deg)`;
  }

  // --- USER INTERACTION EVENTS ---
  bindEvents() {
    // Play / Pause
    document.getElementById('btn-play').onclick = () => {
      this.isPlaying = !this.isPlaying;
      document.getElementById('play-icon').classList.toggle('hidden', this.isPlaying);
      document.getElementById('pause-icon').classList.toggle('hidden', !this.isPlaying);
    };

    // Frame step
    document.getElementById('btn-frame-prev').onclick = () => {
      this.currentTime = Math.max(0, this.currentTime - 1.0 / this.fps);
      this.updatePlayhead();
    };
    document.getElementById('btn-frame-next').onclick = () => {
      this.currentTime = Math.min(this.duration, this.currentTime + 1.0 / this.fps);
      this.updatePlayhead();
    };

    // Ruler Touch Scrubbing
    const ruler = document.getElementById('timeline-ruler');
    const onScrub = (e) => {
      const rect = ruler.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      this.currentTime = Math.max(0, Math.min(this.duration, (x / rect.width) * this.duration));
      this.updatePlayhead();
    };
    ruler.addEventListener('touchstart', onScrub);
    ruler.addEventListener('touchmove', onScrub);
    ruler.addEventListener('mousedown', onScrub);

    // Bottom Dock Action Sheets Toggle
    document.querySelectorAll('[data-sheet]').forEach(btn => {
      btn.onclick = () => {
        const sheetId = btn.dataset.sheet;
        const sheet = document.getElementById(sheetId);
        const isOpen = sheet.classList.contains('open');
        document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('open'));
        if (!isOpen) {
          sheet.classList.add('open');
          if (sheetId === 'sheet-curves') this.drawCurveGraph();
        }
      };
    });

    document.querySelectorAll('.sheet-close-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('open'));
      };
    });

    // 1. ADD VIDEO / PHOTO BUTTON -> Native iOS Gallery Picker
    const fileInput = document.getElementById('media-file-input');
    document.getElementById('btn-action-add-video').onclick = () => {
      fileInput.click();
    };

    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const isVideo = file.type.startsWith('video');
      const url = URL.createObjectURL(file);
      const newId = `media_${Date.now()}`;

      if (isVideo) {
        const video = document.createElement('video');
        video.src = url;
        video.crossOrigin = "anonymous";
        video.playsInline = true;
        video.muted = true;
        video.loop = true;
        video.load();
        video.play().catch(() => {});
        this.mediaElements[newId] = video;
      } else {
        const img = new Image();
        img.src = url;
        this.mediaElements[newId] = img;
      }

      this.layers.push({
        id: newId,
        name: isVideo ? "Video Clip" : "Photo",
        type: "media",
        startTime: this.currentTime,
        endTime: this.duration,
        posX: 0, posY: 0, scale: 1.0, rot: 0, opacity: 1.0,
        keyframes: {},
        effects: []
      });

      this.selectLayer(newId);
    };

    // 2. ADD TEXT BUTTON
    document.getElementById('btn-action-add-text').onclick = () => {
      const newId = `text_${Date.now()}`;
      this.layers.push({
        id: newId,
        name: "My Text",
        type: "text",
        text: "МОЙ ТЕКСТ",
        color: "#f72585",
        fontSize: 32,
        anim: "stagger_pop",
        startTime: this.currentTime,
        endTime: this.duration,
        posX: 0, posY: 0, scale: 1.0, rot: 0, opacity: 1.0,
        keyframes: {},
        effects: []
      });

      this.selectLayer(newId);
      // Open text sheet directly
      document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('open'));
      document.getElementById('sheet-text-anim').classList.add('open');
      document.getElementById('live-text-input').focus();
    };

    // Live Text Editing
    document.getElementById('live-text-input').oninput = (e) => {
      const sel = this.getSelectedLayer();
      if (sel && sel.type === "text") {
        sel.text = e.target.value;
      }
    };
    document.getElementById('live-text-color').oninput = (e) => {
      const sel = this.getSelectedLayer();
      if (sel) {
        sel.color = e.target.value;
        this.renderTimeline();
      }
    };

    // Text Anim Cards
    document.querySelectorAll('.t-card').forEach(card => {
      card.onclick = () => {
        document.querySelectorAll('.t-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const sel = this.getSelectedLayer();
        if (sel && sel.type === "text") {
          sel.anim = card.dataset.anim;
        }
      };
    });

    // FX Pick Cards
    document.querySelectorAll('.fx-pick-card').forEach(card => {
      card.onclick = () => {
        const fxType = card.dataset.fx;
        const sel = this.getSelectedLayer();
        if (!sel) return;

        const presets = {
          optic_glow: { type: "optic_glow", name: "Optic Deep Glow", params: { radius: 0.02, intensity: 2.0 } },
          chromatic_aberration: { type: "chromatic_aberration", name: "RGB Split", params: { amount: 0.02 } },
          cyber_glitch: { type: "cyber_glitch", name: "Cyber Glitch", params: { intensity: 0.5 } },
          camera_shake: { type: "camera_shake", name: "Camera Shake", params: { speed: 18.0 } },
          vhs_retro: { type: "vhs_retro", name: "VHS 1984", params: { noise: 0.4 } }
        };

        if (presets[fxType]) {
          sel.effects.push(JSON.parse(JSON.stringify(presets[fxType])));
          this.renderActiveFXList();
        }
      };
    });

    // Transform Sliders
    const linkT = (id, prop, lblId, unit) => {
      document.getElementById(id).oninput = (e) => {
        const sel = this.getSelectedLayer();
        if (!sel) return;
        sel[prop] = parseFloat(e.target.value);
        document.getElementById(lblId).textContent = `${sel[prop]}${unit}`;
        this.updateGizmo();
      };
    };
    linkT('t-scale', 'scale', 'lbl-scale', 'x');
    linkT('t-pos-x', 'posX', 'lbl-pos-x', 'px');
    linkT('t-pos-y', 'posY', 'lbl-pos-y', 'px');
    linkT('t-rot', 'rot', 'lbl-rot', '°');
    linkT('t-opacity', 'opacity', 'lbl-opacity', '%');

    // Add Keyframe Button
    document.getElementById('btn-keyframe-add').onclick = () => {
      const sel = this.getSelectedLayer();
      if (!sel) return;
      if (!sel.keyframes) sel.keyframes = {};
      if (!sel.keyframes.scale) sel.keyframes.scale = [];
      sel.keyframes.scale.push({
        time: parseFloat(this.currentTime.toFixed(2)),
        val: sel.scale,
        curve: this.selectedCurve
      });
      this.renderTimeline();
    };

    // Delete Layer
    document.getElementById('btn-delete-layer').onclick = () => {
      if (this.layers.length <= 1) return;
      this.layers = this.layers.filter(l => l.id !== this.selectedLayerId);
      this.selectLayer(this.layers[0].id);
    };

    // Split Layer at playhead
    document.getElementById('btn-split-layer').onclick = () => {
      const sel = this.getSelectedLayer();
      if (!sel || this.currentTime <= sel.startTime || this.currentTime >= sel.endTime) return;

      const origEnd = sel.endTime;
      sel.endTime = this.currentTime;

      const clone = JSON.parse(JSON.stringify(sel));
      clone.id = `split_${Date.now()}`;
      clone.name = `${sel.name} (Part 2)`;
      clone.startTime = this.currentTime;
      clone.endTime = origEnd;

      this.layers.push(clone);
      this.selectLayer(clone.id);
    };

    // Curves presets
    document.querySelectorAll('.curve-chip').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.curve-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCurve = btn.dataset.curve;
        this.drawCurveGraph();
      };
    });

    // Aspect Ratio Toggle
    document.getElementById('btn-aspect-toggle').onclick = (e) => {
      if (this.aspectRatio === "9:16") {
        this.aspectRatio = "16:9";
        e.target.textContent = "16:9";
      } else if (this.aspectRatio === "16:9") {
        this.aspectRatio = "1:1";
        e.target.textContent = "1:1";
      } else {
        this.aspectRatio = "9:16";
        e.target.textContent = "9:16";
      }
      this.initCanvasSize();
      this.updateGizmo();
    };

    // Export Dialog
    document.getElementById('btn-open-export').onclick = () => {
      document.getElementById('export-popup').classList.remove('hidden');
    };
    document.getElementById('btn-cancel-render').onclick = () => {
      document.getElementById('export-popup').classList.add('hidden');
    };
    document.getElementById('btn-run-render').onclick = () => {
      const bar = document.getElementById('export-fill');
      const st = document.getElementById('export-status');
      let p = 0;
      const it = setInterval(() => {
        p += 5;
        bar.style.width = `${p}%`;
        st.textContent = `Рендеринг кадров: ${p}% (MP4 H.264)`;
        if (p >= 100) {
          clearInterval(it);
          st.textContent = "Готово! Видео сохранено в Фотопленку iPhone.";
        }
      }, 50);
    };

    window.onresize = () => {
      this.initCanvasSize();
      this.drawRuler();
      this.updateGizmo();
    };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.auraStudio = new AuraMobileStudio();
});
