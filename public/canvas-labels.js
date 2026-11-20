/* =============================================================
 * L.CanvasLabels — ป้ายรหัสแปลงแบบ canvas สำหรับข้อมูลจำนวนมาก
 * ออกแบบสำหรับ ltaxmap: 8,000+ แปลง โดยไม่สร้าง DOM ต่อแปลง
 *
 * วิธีใช้:
 *   const labels = new L.CanvasLabels({ minZoom: 16 }).addTo(map);
 *   labels.setFromGeoJSON(parcelGeoJSON, 'parcel_code');
 *
 *   // เปิด/ปิด
 *   labels.setVisible(checkbox.checked);
 * ============================================================= */

L.CanvasLabels = L.Layer.extend({

  options: {
    pane:      'labelsPane',   // ชั้นของตัวเอง: เหนือ polygon แต่ใต้จุดแก้ไขของ Leaflet.draw
    prop:      'parcel_code',
    minZoom:   16,             // ซูมต่ำกว่านี้ไม่แสดง
    font:      '600 11px "Sarabun", sans-serif',
    color:     '#ff2d2d',
    haloColor: '#ffffff',
    haloWidth: 3,
    padding:   2,              // ระยะกันชนตอนตรวจทับ (px)
    collision: true,           // ไม่วาดป้ายที่ทับป้ายอื่น (แบบ QGIS)
    maxLabels: 1200,           // เพดานกันเครื่องอืดบนจอใหญ่
    maxDpr:    2               // iPhone/iPad เป็น 3 — เกินความจำเป็นสำหรับตัวหนังสือ
  },

  initialize: function (options) {
    L.setOptions(this, options);
    this._labels  = [];        // [{lat, lng, text}]
    this._visible = true;
  },

  /* ---------- ข้อมูล ---------- */

  // คำนวณจุดวางป้ายครั้งเดียวตอนโหลด แล้วเก็บไว้ใช้ตลอด
  setFromGeoJSON: function (geojson, prop) {
    prop = prop || this.options.prop;
    const feats = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
    const out = [];
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      const text = f.properties ? f.properties[prop] : null;
      if (text === null || text === undefined || text === '') continue;
      const p = anchorOf(f.geometry);
      if (p) out.push({ lng: p[0], lat: p[1], text: String(text) });
    }
    return this.setLabels(out);
  },

  setLabels: function (labels) {
    this._labels = labels || [];
    this._redraw();
    return this;
  },

  setVisible: function (on) {
    this._visible = !!on;
    this._redraw();
    return this;
  },

  /* ---------- วงจรชีวิต ---------- */

  onAdd: function (map) {
    this._map = map;

    // สร้างชั้นของตัวเอง z-index 450 = เหนือ polygon (400) ใต้ marker/จุดแก้ไข (600)
    let pane = map.getPane(this.options.pane);
    if (!pane) {
      pane = map.createPane(this.options.pane);
      pane.style.zIndex        = 450;
      pane.style.pointerEvents = 'none';
    }

    const c = this._canvas = L.DomUtil.create('canvas', 'leaflet-canvas-labels');
    c.style.position      = 'absolute';
    c.style.pointerEvents = 'none';          // คลิกทะลุไปโดนแปลงได้ปกติ
    pane.appendChild(c);

    this._resize();
    map.on('move zoom viewreset', this._redraw, this);
    map.on('resize', this._onResize, this);
    map.on('zoomanim', this._hide, this);
    this._redraw();
  },

  onRemove: function (map) {
    if (this._frame) { L.Util.cancelAnimFrame(this._frame); this._frame = null; }
    map.off('move zoom viewreset', this._redraw, this);
    map.off('resize', this._onResize, this);
    map.off('zoomanim', this._hide, this);
    L.DomUtil.remove(this._canvas);
    this._canvas = this._ctx = null;
  },

  /* ---------- ภายใน ---------- */

  _onResize: function () { this._resize(); this._redraw(); },

  _resize: function () {
    const size = this._map.getSize();
    const dpr  = Math.min(window.devicePixelRatio || 1, this.options.maxDpr);
    const c    = this._canvas;
    c.width  = Math.round(size.x * dpr);
    c.height = Math.round(size.y * dpr);
    c.style.width  = size.x + 'px';
    c.style.height = size.y + 'px';
    this._ctx = c.getContext('2d');
    this._ctx.scale(dpr, dpr);               // ตั้ง width ใหม่ = transform รีเซ็ต ต้อง scale ซ้ำ
  },

  _hide: function () { if (this._canvas) this._canvas.style.display = 'none'; },

  // รวบการวาดให้เหลือเฟรมละครั้ง แม้ event จะยิงถี่แค่ไหนตอนลากแผนที่
  _redraw: function () {
    if (this._frame) return;
    this._frame = L.Util.requestAnimFrame(this._draw, this);
  },

  _draw: function () {
    this._frame = null;
    const map = this._map, ctx = this._ctx;
    if (!map || !ctx) return;

    // ตรึง canvas ไว้กับมุมซ้ายบนของจอเสมอ
    L.DomUtil.setPosition(this._canvas, map.containerPointToLayerPoint([0, 0]));
    this._canvas.style.display = '';

    const size = map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);

    if (!this._visible || map.getZoom() < this.options.minZoom) return;

    const o = this.options;
    ctx.font         = o.font;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth    = o.haloWidth;
    ctx.lineJoin     = 'round';
    ctx.strokeStyle  = o.haloColor;
    ctx.fillStyle    = o.color;

    const b = map.getBounds();
    const north = b.getNorth(), south = b.getSouth(),
          east  = b.getEast(),  west  = b.getWest();

    const drawn = [];
    let n = 0;

    for (let i = 0; i < this._labels.length; i++) {
      const l = this._labels[i];

      // คัดเฉพาะที่อยู่ในจอก่อน แล้วค่อย project (เร็วกว่ามากตอนมี 8,000 จุด)
      if (l.lat < south || l.lat > north || l.lng < west || l.lng > east) continue;

      const p = map.latLngToContainerPoint([l.lat, l.lng]);
      const w = ctx.measureText(l.text).width;
      const hw = w / 2 + o.padding, hh = 6 + o.padding;
      const x0 = p.x - hw, y0 = p.y - hh, x1 = p.x + hw, y1 = p.y + hh;

      if (o.collision) {
        let hit = false;
        for (let k = 0; k < drawn.length; k++) {
          const d = drawn[k];
          if (x0 < d[2] && x1 > d[0] && y0 < d[3] && y1 > d[1]) { hit = true; break; }
        }
        if (hit) continue;
        drawn.push([x0, y0, x1, y1]);
      }

      ctx.strokeText(l.text, p.x, p.y);      // halo
      ctx.fillText(l.text, p.x, p.y);        // ตัวอักษร

      if (++n >= o.maxLabels) break;
    }
  }
});

/* ---------- หาจุดวางป้าย: centroid ของวงนอกที่ใหญ่ที่สุด ---------- */

function anchorOf(geom) {
  if (!geom) return null;
  let polys = null;
  if (geom.type === 'Polygon')           polys = [geom.coordinates];
  else if (geom.type === 'MultiPolygon') polys = geom.coordinates;
  else if (geom.type === 'Point')        return geom.coordinates;
  else return null;

  let best = null, bestArea = -Infinity;
  for (let i = 0; i < polys.length; i++) {
    const c = ringCentroid(polys[i][0]);
    if (c && c.area > bestArea) { bestArea = c.area; best = [c.x, c.y]; }
  }
  return best;
}

function ringCentroid(ring) {
  if (!ring || ring.length < 3) return null;
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    x += (ring[j][0] + ring[i][0]) * f;
    y += (ring[j][1] + ring[i][1]) * f;
  }
  if (a === 0) {   // วงแบน — ใช้กึ่งกลาง bbox แทน
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      x0 = Math.min(x0, ring[i][0]); x1 = Math.max(x1, ring[i][0]);
      y0 = Math.min(y0, ring[i][1]); y1 = Math.max(y1, ring[i][1]);
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, area: 0 };
  }
  a *= 0.5;
  return { x: x / (6 * a), y: y / (6 * a), area: Math.abs(a) };
}
