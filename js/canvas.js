/**
 * Apple Pencil & Touch Optimized Handwriting Canvas
 * Uses Pointer Events API, quadratic Bezier curve stroke smoothing,
 * pressure support, undo history, eraser, and guide grid overlays.
 */

class HandwritingCanvas {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    
    this.options = Object.assign({
      strokeColor: '#1E293B',
      strokeWidth: 5,
      isEraser: false,
      gridType: 'mi', // 'mi' (米), 'cross' (十), 'none'
      watermarkChar: '',
      watermarkFont: 'Noto Serif KR, serif',
      onStrokeEnd: null
    }, options);

    this.isDrawing = false;
    this.strokes = []; // Array of strokes: [{ points: [{x, y, pressure}], color, width, isEraser }]
    this.currentStroke = null;
    this.dpr = window.devicePixelRatio || 1;

    this.initEvents();
    this.resize();
  }

  initEvents() {
    this.canvas.style.touchAction = 'none';

    // Pointer events for iPad Apple Pencil & touch
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));
    this.canvas.addEventListener('pointerleave', this.handlePointerUp.bind(this));

    // Window resize observer
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.canvas.parentElement || this.canvas);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    this.redrawAll();
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure && e.pressure > 0 ? e.pressure : 0.5
    };
  }

  handlePointerDown(e) {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.isDrawing = true;

    const pos = this.getPointerPos(e);
    this.currentStroke = {
      color: this.options.strokeColor,
      width: this.options.strokeWidth,
      isEraser: this.options.isEraser,
      points: [pos]
    };
    this.strokes.push(this.currentStroke);

    // Render initial point dot
    this.drawPoint(pos, this.currentStroke);
  }

  handlePointerMove(e) {
    if (!this.isDrawing || !this.currentStroke) return;
    e.preventDefault();

    const pos = this.getPointerPos(e);
    const pts = this.currentStroke.points;
    const prev = pts[pts.length - 1];

    // Throttle close points for performance
    const dist = Math.hypot(pos.x - prev.x, pos.y - prev.y);
    if (dist < 2) return;

    pts.push(pos);
    this.drawLatestSegment(this.currentStroke);
  }

  handlePointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.currentStroke = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (typeof this.options.onStrokeEnd === 'function') {
      this.options.onStrokeEnd(this.strokes.length);
    }
  }

  drawPoint(p, stroke) {
    const ctx = this.ctx;
    ctx.save();
    if (stroke.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.width * 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this.resolveColor(stroke.color, p.x, p.y);
      ctx.beginPath();
      const radius = Math.max(1.5, (stroke.width / 2) * (0.6 + p.pressure * 0.8));
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLatestSegment(stroke) {
    const pts = stroke.points;
    if (pts.length < 2) return;

    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];

    const ctx = this.ctx;
    ctx.save();

    if (stroke.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = stroke.width * 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.resolveColor(stroke.color, p2.x, p2.y);
      const avgPressure = (p1.pressure + p2.pressure) / 2;
      ctx.lineWidth = Math.max(2, stroke.width * (0.6 + avgPressure * 0.8));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      if (pts.length > 2) {
        const p0 = pts[pts.length - 3];
        const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        ctx.moveTo(mid1.x, mid1.y);
        ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
      } else {
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  resolveColor(colorSpec, x, y) {
    if (colorSpec === 'gradient-ribbon') {
      const grad = this.ctx.createLinearGradient(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
      grad.addColorStop(0, '#FF9A44');
      grad.addColorStop(0.3, '#FC6076');
      grad.addColorStop(0.7, '#B721FF');
      grad.addColorStop(1, '#21D4FD');
      return grad;
    }
    return colorSpec;
  }

  redrawAll() {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    this.ctx.clearRect(0, 0, width, height);

    // 1. Draw Grid Guidelines
    this.drawGrid(width, height);

    // 2. Draw Watermark if present
    if (this.options.watermarkChar) {
      this.drawWatermark(width, height);
    }

    // 3. Draw All Strokes
    for (const stroke of this.strokes) {
      if (stroke.points.length === 0) continue;
      if (stroke.points.length === 1) {
        this.drawPoint(stroke.points[0], stroke);
        continue;
      }

      this.ctx.save();
      if (stroke.isEraser) {
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = stroke.width * 3.5;
      } else {
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.strokeStyle = this.resolveColor(stroke.color, width / 2, height / 2);
        this.ctx.lineWidth = stroke.width;
      }
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      this.ctx.beginPath();
      const pts = stroke.points;
      this.ctx.moveTo(pts[0].x, pts[0].y);

      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        this.ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
      }
      if (pts.length > 1) {
        this.ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  drawGrid(w, h) {
    if (this.options.gridType === 'none') return;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)'; // Slate-300 subtle
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);

    const midX = w / 2;
    const midY = h / 2;

    // Cross grid (십자격 十)
    this.ctx.beginPath();
    this.ctx.moveTo(midX, 10);
    this.ctx.lineTo(midX, h - 10);
    this.ctx.moveTo(10, midY);
    this.ctx.lineTo(w - 10, midY);
    this.ctx.stroke();

    // Diagonal lines for 米자격
    if (this.options.gridType === 'mi') {
      this.ctx.beginPath();
      this.ctx.moveTo(15, 15);
      this.ctx.lineTo(w - 15, h - 15);
      this.ctx.moveTo(w - 15, 15);
      this.ctx.lineTo(15, h - 15);
      this.ctx.stroke();
    }

    // Outer subtle boundary square
    this.ctx.setLineDash([]);
    this.ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)';
    this.ctx.strokeRect(10, 10, w - 20, h - 20);

    this.ctx.restore();
  }

  drawWatermark(w, h) {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(203, 213, 225, 0.22)'; // Soft slate ghost
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    const fontSize = Math.min(w, h) * 0.72;
    this.ctx.font = `${fontSize}px ${this.options.watermarkFont}`;
    this.ctx.fillText(this.options.watermarkChar, w / 2, h / 2 + fontSize * 0.05);
    this.ctx.restore();
  }

  // --- External Control APIs ---
  setWatermark(char, font) {
    this.options.watermarkChar = char || '';
    if (font) this.options.watermarkFont = font;
    this.redrawAll();
  }

  setGridType(type) {
    this.options.gridType = type;
    this.redrawAll();
  }

  setColor(color) {
    this.options.strokeColor = color;
    this.options.isEraser = false;
  }

  setWidth(width) {
    this.options.strokeWidth = width;
  }

  setEraser(isEraser) {
    this.options.isEraser = isEraser;
  }

  undo() {
    if (this.strokes.length > 0) {
      this.strokes.pop();
      this.redrawAll();
      if (typeof this.options.onStrokeEnd === 'function') {
        this.options.onStrokeEnd(this.strokes.length);
      }
    }
  }

  clear() {
    this.strokes = [];
    this.redrawAll();
    if (typeof this.options.onStrokeEnd === 'function') {
      this.options.onStrokeEnd(0);
    }
  }

  isEmpty() {
    return this.strokes.length === 0;
  }

  toDataURL() {
    return this.canvas.toDataURL('image/png');
  }
}
