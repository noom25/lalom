/* =============================================================
 * gps-parcel.js — ตำแหน่งฉัน + บอกว่ายืนอยู่แปลงไหน
 * วางไว้ที่ js/gps-parcel.js แล้วเพิ่มต่อจาก js/labels-init.js:
 *     <script src="js/gps-parcel.js"></script>
 * ไม่ต้องแก้ไฟล์เดิมใดๆ
 *
 * ** GPS ทำงานเฉพาะบน https หรือ localhost เท่านั้น **
 *    เปิดผ่าน LAN (http://192.168.x.x:8000) browser จะบล็อก
 * ============================================================= */

(function () {
  // ชื่อฟิลด์ต่างกันในแต่ละ อบต. (shapefile ตัดชื่อเหลือ 10 ตัวอักษร) — ไล่หาเอง
  const PROPS = ['parcel_code', 'PARCEL_CODE', 'PARCEL_COD', 'parcel_cod', 'ParcelCode'];
  const ZONES = ['zone', 'ZONE_ID', 'ZONE'];
  const BLOCKS = ['block', 'BLOCK_ID', 'BLOCK'];
  const LOTS  = ['lot', 'LOT', 'PARCEL_NO'];

  function pick(p, names) {
    for (let i = 0; i < names.length; i++) {
      const v = p[names[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }

  // ตำแหน่งปุ่ม: topleft / topright / bottomleft / bottomright
  // topright ชนกับกล่อง Layers เดิม เลยใช้ topleft (ต่อจากปุ่มซูม/วาด)
  const POSITION = 'topleft';

  /* ---------- หาแผนที่ ---------- */

  function isMap(o) {
    return !!o && typeof o.getZoom === 'function'
               && typeof o.eachLayer === 'function'
               && typeof o.getPanes === 'function';
  }

  function findMap() {
    try { const m = eval('map'); if (isMap(m)) return m; } catch (e) {}
    const names = ['map', 'leafletMap', 'mapInstance', 'myMap', 'MAP', '_map'];
    for (let i = 0; i < names.length; i++) if (isMap(window[names[i]])) return window[names[i]];
    for (const k in window) { try { if (isMap(window[k])) return window[k]; } catch (e) {} }
    return null;
  }

  /* ---------- เก็บแปลง + ทำ bbox ไว้ค้นหาเร็วๆ ---------- */

  function collect(layer, out) {
    const p = layer.feature && layer.feature.properties;
    if (p && pick(p, PROPS) !== null) out.push(layer.feature);
    if (layer.eachLayer) layer.eachLayer(function (c) { collect(c, out); });
    return out;
  }

  function collectParcels(map) {
    let best = [];
    map.eachLayer(function (g) {
      const f = collect(g, []);
      if (f.length > best.length) best = f;
    });
    return best;
  }

  function bboxOf(geom) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const polys = geom.type === 'Polygon' ? [geom.coordinates]
                : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0];
      for (let i = 0; i < ring.length; i++) {
        const x = ring[i][0], y = ring[i][1];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return x0 === Infinity ? null : [x0, y0, x1, y1];
  }

  /* ---------- จุดอยู่ในรูปหลายเหลี่ยมไหม (ray casting) ---------- */

  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function inPolygon(x, y, geom) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates]
                : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
      if (!inRing(x, y, poly[0])) continue;
      let inHole = false;
      for (let h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) { inHole = true; break; }
      if (!inHole) return true;
    }
    return false;
  }

  /* ---------- แปลงพิกัดสำหรับวาดไฮไลต์ ---------- */
  // ใช้ L.polygon ไม่ใช่ L.geoJSON เพราะ L.geoJSON จะมี .feature ติดมาด้วย
  // ซึ่งโค้ด Export/บันทึก ที่ไล่เก็บ layer ที่มี .feature อาจนับแปลงนี้ซ้ำ

  function toLatLngs(geom) {
    const ring = function (r) { return r.map(function (c) { return [c[1], c[0]]; }); };
    if (geom.type === 'Polygon')      return geom.coordinates.map(ring);
    if (geom.type === 'MultiPolygon') return geom.coordinates.map(function (p) { return p.map(ring); });
    return null;
  }

  /* ---------- แถบแสดงผลด้านล่าง ---------- */

  function makeBanner() {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:1200;' +
      'background:rgba(255,255,255,.96);border:2px solid #0d6efd;border-radius:10px;' +
      'padding:8px 16px;box-shadow:0 2px 10px rgba(0,0,0,.3);display:none;' +
      'font:14px system-ui,"Sarabun",sans-serif;text-align:center;cursor:pointer;' +
      'max-width:90vw;-webkit-user-select:none;user-select:none;';
    document.body.appendChild(el);
    return el;
  }

  /* ---------- เริ่มทำงาน ---------- */

  function boot() {
    const map = findMap();
    if (!map) { console.warn('[gps] หาแผนที่ไม่เจอ'); return; }

    const banner = makeBanner();

    let watchId   = null;
    let following = true;
    let parcels   = null;    // [{feature, bbox}] สร้างครั้งเดียวตอนใช้งานจริง
    let meMarker  = null;
    let meCircle  = null;
    let hilite    = null;    // ชั้นไฮไลต์แปลงที่ยืนอยู่ (ไม่ไปยุ่ง style ของเดิม)
    let lastCode  = null;
    let wakeLock  = null;

    function buildIndex() {
      const feats = collectParcels(map);
      parcels = [];
      for (const f of feats) {
        const b = bboxOf(f.geometry);
        if (b) parcels.push({ f: f, b: b });
      }
      console.log('[gps] เตรียมค้นหาแปลง ' + parcels.length + ' แปลง');
    }

    function findParcelAt(lng, lat) {
      if (!parcels) buildIndex();
      for (let i = 0; i < parcels.length; i++) {
        const b = parcels[i].b;
        if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;   // คัดด้วย bbox ก่อน
        if (inPolygon(lng, lat, parcels[i].f.geometry)) return parcels[i].f;
      }
      return null;
    }

    /* ---- หน้าจอไม่ให้ดับตอนเดินสำรวจ ---- */
    async function keepAwake(on) {
      try {
        if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
        else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
      } catch (e) {}
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && watchId !== null) keepAwake(true);
    });

    /* ---- อัปเดตเมื่อได้พิกัดใหม่ ---- */
    function onPosition(pos) {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy || 0);
      const ll  = L.latLng(lat, lng);

      if (!meMarker) {
        meCircle = L.circle(ll, { radius: acc, color: '#0d6efd', weight: 1,
                                  fillOpacity: .12, interactive: false }).addTo(map);
        meMarker = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 3,
                                        fillColor: '#0d6efd', fillOpacity: 1,
                                        interactive: false }).addTo(map);
      } else {
        meMarker.setLatLng(ll);
        meCircle.setLatLng(ll).setRadius(acc);
      }

      if (following) map.setView(ll, Math.max(map.getZoom(), 18), { animate: true });

      const f = findParcelAt(lng, lat);
      if (hilite) { map.removeLayer(hilite); hilite = null; }

      if (f) {
        const p = f.properties;
        const latlngs = toLatLngs(f.geometry);
        if (latlngs) {
          hilite = L.polygon(latlngs, { color: '#ff9800', weight: 4, fillColor: '#ff9800',
                                        fillOpacity: .25, interactive: false }).addTo(map);
        }
        const code = pick(p, PROPS);
        banner.innerHTML =
          '<div style="font-size:26px;font-weight:800;color:#0d6efd;letter-spacing:.5px">'
            + code + '</div>' +
          '<div style="color:#444;margin-top:2px">' +
            'โซน ' + (pick(p, ZONES) || '-') + ' · บล็อก ' + (pick(p, BLOCKS) || '-') +
            ' · ล็อต ' + (pick(p, LOTS) || '-') + '</div>' +
          '<div style="color:#888;font-size:12px;margin-top:2px">ความแม่นยำ ±' + acc + ' ม.</div>';
        banner.style.borderColor = '#0d6efd';
        banner.onclick = hilite ? function () { map.fitBounds(hilite.getBounds(), { maxZoom: 19 }); } : null;

        if (code !== lastCode && navigator.vibrate) navigator.vibrate(60);   // สั่นเตือนตอนเข้าแปลงใหม่
        lastCode = code;
      } else {
        banner.innerHTML =
          '<div style="font-size:16px;color:#666">ไม่ได้อยู่ในแปลงที่มีข้อมูล</div>' +
          '<div style="color:#888;font-size:12px;margin-top:2px">ความแม่นยำ ±' + acc + ' ม.</div>';
        banner.style.borderColor = '#bbb';
        banner.onclick = null;
        lastCode = null;
      }
      banner.style.display = 'block';
    }

    function onError(err) {
      let msg = 'อ่านตำแหน่งไม่ได้';
      if (err.code === 1) msg = 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — ต้องอนุญาตใน browser';
      else if (err.code === 2) msg = 'หาสัญญาณ GPS ไม่ได้';
      else if (err.code === 3) msg = 'รอสัญญาณ GPS นานเกินไป';
      banner.innerHTML = '<div style="font-size:15px;color:#c00">' + msg + '</div>';
      banner.style.borderColor = '#c00';
      banner.style.display = 'block';
      stop();
    }

    function start() {
      if (!navigator.geolocation) { alert('เครื่องนี้ไม่รองรับ GPS'); return; }
      if (!window.isSecureContext) {
        alert('GPS ใช้ได้เฉพาะ https หรือ localhost\n' +
              'ถ้าเปิดผ่าน LAN (192.168.x.x) browser จะบล็อก');
        return;
      }
      following = true;
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true, maximumAge: 2000, timeout: 15000
      });
      keepAwake(true);
      setBtn(true);
    }

    function stop() {
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      keepAwake(false);
      if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
      if (meCircle) { map.removeLayer(meCircle); meCircle = null; }
      if (hilite)   { map.removeLayer(hilite);   hilite = null; }
      banner.style.display = 'none';
      lastCode = null;
      setBtn(false);
    }

    // ลากแผนที่เอง = หยุดตามตำแหน่ง (กดปุ่มซ้ำเพื่อกลับมาตาม)
    map.on('dragstart', function () { following = false; });

    /* ---- ปุ่ม ---- */
    let btnEl = null;
    function setBtn(on) {
      if (!btnEl) return;
      btnEl.style.background = on ? '#0d6efd' : '';
      btnEl.style.color      = on ? '#fff'    : '';
      btnEl.title = on ? 'หยุดติดตามตำแหน่ง' : 'ตำแหน่งฉัน';
    }

    const Ctl = L.Control.extend({
      options: { position: POSITION },
      onAdd: function () {
        const box = L.DomUtil.create('div', 'leaflet-bar');
        const a   = L.DomUtil.create('a', '', box);   // ใช้ <a> เพื่อให้ขนาดเท่าปุ่มซูมเดิม
        a.href  = '#';
        a.title = 'ตำแหน่งฉัน';
        a.setAttribute('role', 'button');
        a.innerHTML = '<i class="fas fa-crosshairs"></i>';

        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.on(a, 'click', function (e) {
          L.DomEvent.preventDefault(e);
          if (watchId === null) start();
          else if (!following) following = true;   // กดซ้ำตอนเลื่อนแผนที่เอง = กลับมาตาม
          else stop();
        });
        btnEl = a;
        return box;
      }
    });
    map.addControl(new Ctl());

    window.gpsParcel = { start: start, stop: stop,
                         at: function (lat, lng) { return findParcelAt(lng, lat); } };
  }

  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', boot);
})();
