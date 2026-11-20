/* =============================================================
 * labels-init.js — ป้ายรหัสแปลงบน ltaxmap (มีปุ่มเปิด/ปิด)
 * วางไว้ที่ js/labels-init.js แล้วเพิ่มต่อจาก js/app.js:
 *     <script src="js/labels-init.js"></script>
 * ไม่ต้องแก้ไฟล์เดิมใดๆ
 *
 * ปิดอยู่ = ไม่สร้างป้าย ไม่กินทรัพยากร จะเริ่มทำงานเมื่อกดเปิด
 * ============================================================= */

(function () {
  // ชื่อฟิลด์รหัสแปลงต่างกันในแต่ละ อบต. (shapefile ตัดชื่อเหลือ 10 ตัวอักษร)
  // ไล่หาตามลำดับนี้ เจออันไหนก่อนใช้อันนั้น
  const PROPS = ['parcel_code', 'PARCEL_CODE', 'PARCEL_COD', 'parcel_cod', 'ParcelCode'];

  const STORE_KEY = 'ltaxmap_show_labels';

  // ตำแหน่งปุ่ม: topleft / topright / bottomleft / bottomright
  // topright ชนกับกล่อง Layers เดิม เลยใช้ topleft (ต่อจากปุ่มซูม/วาด)
  const POSITION = 'topleft';

  const isMobile = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
                   || window.innerWidth < 820;

  // มือถือ = เครื่องที่ใช้จริงตอนออกสำรวจ ตัวใหญ่ ขอบขาวหนา อ่านกลางแดดได้
  // โน้ตบุ๊ก = นั่งทำในออฟฟิศ ใช้ช่องค้นหาเอาได้ ป้ายเล็กลงเพื่อไม่ให้รก
  const OPTS = isMobile
    ? { minZoom: 17, maxLabels: 300, font: '700 13px "Sarabun",sans-serif', haloWidth: 4 }
    : { minZoom: 16, maxLabels: 1200, font: '600 11px "Sarabun",sans-serif', haloWidth: 3 };

  /* ---------- จำค่าเปิด/ปิด ---------- */

  function loadPref() {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (e) {}
    return isMobile;             // ครั้งแรก: มือถือเปิด (ใช้ตอนออกสำรวจ) โน้ตบุ๊กปิด
  }

  function savePref(on) {
    try { localStorage.setItem(STORE_KEY, on ? '1' : '0'); } catch (e) {}
  }

  /* ---------- หาแผนที่ ---------- */
  // ระวัง: <div id="map"> ทำให้ window.map เป็น DOM element ไม่ใช่แผนที่

  function isMap(o) {
    return !!o && typeof o.getZoom === 'function'
               && typeof o.eachLayer === 'function'
               && typeof o.getPanes === 'function';
  }

  function findMap() {
    try { const m = eval('map'); if (isMap(m)) return m; } catch (e) {}
    const names = ['map', 'leafletMap', 'mapInstance', 'myMap', 'MAP', '_map'];
    for (let i = 0; i < names.length; i++) {
      if (isMap(window[names[i]])) return window[names[i]];
    }
    for (const k in window) {
      try { if (isMap(window[k])) return window[k]; } catch (e) {}
    }
    return null;
  }

  /* ---------- เก็บ feature ---------- */

  let foundKey = null;     // ชื่อฟิลด์ที่เจอจริงบนเว็บนี้

  function codeKey(p) {
    for (let i = 0; i < PROPS.length; i++) {
      const v = p[PROPS[i]];
      if (v !== undefined && v !== null && v !== '') return PROPS[i];
    }
    return null;
  }

  function collect(layer, out) {
    const p = layer.feature && layer.feature.properties;
    if (p) {
      const k = codeKey(p);
      if (k) { out.push(layer.feature); if (!foundKey) foundKey = k; }
    }
    if (layer.eachLayer) layer.eachLayer(function (c) { collect(c, out); });
    return out;
  }

  // layer หลายชั้นมีฟิลด์ parcel_code (อาคาร, สปก, แปลงเกษตร, แปลงชุมชน)
  // เลยเลือกเฉพาะกลุ่มที่มีมากที่สุด = ชั้นแปลงที่ดินจริง
  function collectParcels(map) {
    let best = [];
    map.eachLayer(function (group) {
      const feats = collect(group, []);
      if (feats.length > best.length) best = feats;
    });
    return best;
  }

  /* ---------- ปุ่มเปิด/ปิด ---------- */

  function addToggle(map, initialOn, onChange) {
    const Ctl = L.Control.extend({
      options: { position: POSITION },
      onAdd: function () {
        const box = L.DomUtil.create('div', 'leaflet-bar');
        const a   = L.DomUtil.create('a', '', box);   // ใช้ <a> เพื่อให้ขนาดเท่าปุ่มซูมเดิม
        a.href  = '#';
        a.title = 'แสดง/ซ่อนรหัสแปลง';
        a.setAttribute('role', 'button');
        a.innerHTML = '<i class="fas fa-tag"></i>';

        let on = initialOn;
        function paint() {
          a.style.background = on ? '#0d6efd' : '';
          a.style.color      = on ? '#fff'    : '';
        }
        paint();

        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.on(a, 'click', function (e) {
          L.DomEvent.preventDefault(e);
          on = !on;
          paint();
          onChange(on);
        });

        this._set = function (v) { on = v; paint(); };
        return box;
      },
      setChecked: function (v) { if (this._set) this._set(v); }
    });

    const ctl = new Ctl();
    map.addControl(ctl);
    return ctl;
  }

  /* ---------- เริ่มทำงาน ---------- */

  function boot() {
    const map = findMap();
    if (!map || typeof L === 'undefined' || !L.CanvasLabels) {
      console.warn('[labels] ยังหาแผนที่หรือ L.CanvasLabels ไม่เจอ');
      return;
    }

    let labels  = null;        // สร้างต่อเมื่อเปิดใช้ครั้งแรก
    let enabled = loadPref();
    let dirty   = true;        // ข้อมูลเปลี่ยน ต้องสร้างป้ายใหม่

    function build() {
      if (!labels) labels = new L.CanvasLabels(OPTS).addTo(map);
      const feats = collectParcels(map);
      labels.setFromGeoJSON({ type: 'FeatureCollection', features: feats }, foundKey || PROPS[0]);
      dirty = feats.length === 0;          // ยังไม่มีข้อมูล = ลองใหม่รอบหน้า
      return feats.length;
    }

    function apply() {
      if (!enabled) { if (labels) labels.setVisible(false); return; }
      if (dirty) {
        const n = build();
        if (n > 0) console.log('[labels] แสดงรหัสแปลง ' + n + ' แปลง (ฟิลด์ ' + foundKey + ')');
      }
      if (labels) labels.setVisible(true);
    }

    const ctl = addToggle(map, enabled, function (on) {
      enabled = on;
      savePref(on);
      apply();
    });

    // ข้อมูลเปลี่ยน (บันทึก, แบ่ง, รวม, Import) → ตั้งค่าสร้างใหม่
    let pending = null;
    map.on('layeradd layerremove', function () {
      dirty = true;
      clearTimeout(pending);
      pending = setTimeout(function () { if (enabled) apply(); }, 400);
    });

    // เปิดไว้อยู่แล้ว: รอแปลงโหลดเสร็จค่อยสร้างรอบแรก
    if (enabled) {
      let tries = 0;
      const timer = setInterval(function () {
        apply();
        if (!dirty || ++tries >= 30) clearInterval(timer);
      }, 500);
    }

    // เปิดให้สั่งจาก console หรือโค้ดอื่นได้
    window.parcelLabels = {
      show:    function () { enabled = true;  savePref(true);  ctl.setChecked(true);  apply(); },
      hide:    function () { enabled = false; savePref(false); ctl.setChecked(false); apply(); },
      refresh: function () { dirty = true; apply(); },
      layer:   function () { return labels; }
    };
  }

  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', boot);
})();
