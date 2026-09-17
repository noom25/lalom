/* ====================== DRAW & EDIT TOOLS ====================== */
/**
 * คำนวณพื้นที่เป็นหน่วยไทย (ไร่-งาน-วา) จากพื้นที่ตารางเมตร
 * แสดงผลสวยงาม ไม่มี .00 เกะกะ ถ้าไม่มีเศษวาจะไม่แสดงหน่วยนั้น
 */
function calculateThaiArea(areaSqM) {
  if (!areaSqM || areaSqM <= 0) return "0 ไร่ 0 งาน 0 วา";

  const rai = Math.floor(areaSqM / 1600);
  const remainingAfterRai = areaSqM % 1600;

  const ngan = Math.floor(remainingAfterRai / 400);
  const remainingAfterNgan = remainingAfterRai % 400;

  const wa = remainingAfterNgan / 4;

  const waFormatted = wa % 1 === 0 
    ? wa.toFixed(0) 
    : wa.toFixed(2).replace(/\.?0+$/, '');

  const parts = [];
  if (rai > 0) parts.push(`${rai} ไร่`);
  if (ngan > 0) parts.push(`${ngan} งาน`);
  if (wa > 0) parts.push(`${waFormatted} วา`);

  if (parts.length === 0) return "0 ไร่ 0 งาน 0 วา";
  if (rai === 0 && ngan > 0) parts.unshift("0 ไร่");
  if (rai === 0 && ngan === 0 && wa > 0) parts.unshift("0 ไร่ 0 งาน");

  return parts.join(' ');
}

// Initialize Leaflet.draw control
const drawControl = new L.Control.Draw({
  edit: { 
    featureGroup: editableGroup,
    remove: true
  },
  draw: {
    polygon: { 
      allowIntersection: false, 
      showArea: true,
      shapeOptions: {
        color: STYLES.parcel.color,
        weight: 2
      }
    },
    polyline: false, 
    rectangle: false, 
    circle: false, 
    marker: false, 
    circlemarker: false
  }
});
map.addControl(drawControl);

// Active edit mode tracker
let activeEdit = null;
let selectedForMerge = [];
let splitMode = false;
let selectedForSplit = null;

// เก็บเฉพาะ layer ที่ถูกเปลี่ยนสีไว้จริง
let styledLayers = new Set();

// true = คลิกแปลงเพื่อดูข้อมูล (popup) ได้ปกติ
// false = อยู่ในโหมดแก้ไข/แบ่ง/รวม (ปิดการดูข้อมูล เพื่อไม่ให้ popup/ไฮไลต์แดงไปแย่งกับโหมด)
let parcelDataMode = true;

// เก็บ reference ของ map click handler ปัจจุบัน
let activeMapClickHandler = null;
function setMapClickHandler(handler) {
  if (activeMapClickHandler) {
    map.off('click', activeMapClickHandler);
  }
  activeMapClickHandler = handler || null;
  if (handler) {
    map.on('click', handler);
  }
}

// เก็บ handler ของโหมด "แก้ไขข้อมูล" ไว้ระดับโมดูล เพื่อล้างก่อนผูกชุดใหม่
// รองรับทั้ง handler ที่ผูกกับ layer และ handler ที่ผูกกับ map (mousemove hover)
let editModeHandlers = [];
function clearEditModeHandlers() {
  editModeHandlers.forEach(h => {
    if (h.isMap) {
      map.off(h.event || 'mousemove', h.handler);
    } else {
      h.layer.off(h.event || 'click', h.handler);
    }
  });
  editModeHandlers = [];
}

// ล้าง reference ทั้งหมดของ layer ก่อนลบทิ้ง เพื่อกัน memory leak
// (styledLayers, lastHighlighted, และ event handlers ที่ผูกไว้กับ layer)
function cleanupLayer(layer) {
  if (!layer || layer.__cleaned) return;
  layer.__cleaned = true;
  styledLayers.delete(layer);
  if (typeof lastHighlighted !== 'undefined' && Array.isArray(lastHighlighted)) {
    const i = lastHighlighted.indexOf(layer);
    if (i !== -1) lastHighlighted.splice(i, 1);
  }
  if (layer.off) layer.off();
}

// จำกัดความถี่การประมวลผล hover ด้วย requestAnimationFrame
// เพื่อลด GC pressure / CPU เมื่อมีแปลงจำนวนมาก
// (มี fallback ไปใช้ requestAnimationFrame ธรรมดา ถ้า L.DomUtil.* ไม่มี)
const raf = (typeof L.DomUtil.requestAnimFrame === 'function')
  ? L.DomUtil.requestAnimFrame
  : (cb) => window.requestAnimationFrame(cb);
const caf = (typeof L.DomUtil.cancelAnimFrame === 'function')
  ? L.DomUtil.cancelAnimFrame
  : (id) => window.cancelAnimationFrame(id);

function throttleAnimFrame(fn) {
  let frame = null;
  const throttled = (e) => {
    if (frame) return;
    frame = raf(() => {
      frame = null;
      fn(e);
    });
  };
  throttled.cancel = () => {
    if (frame) {
      caf(frame);
      frame = null;
    }
  };
  return throttled;
}

// คำนวณจุดศูนย์กลางจริงของ polygon ผ่าน turf.centroid
function getLayerCenter(layer) {
  try {
    if (window.turf && layer.toGeoJSON) {
      const geo = layer.toGeoJSON();
      if (geo.geometry && (geo.geometry.type === 'Polygon' || geo.geometry.type === 'MultiPolygon')) {
        const c = turf.centroid(geo).geometry.coordinates;
        return L.latLng(c[1], c[0]);
      }
    }
  } catch (e) {}
  return layer.getBounds ? layer.getBounds().getCenter() : null;
}

// วัดระยะจากจุดคลิกถึงเส้นขอบจริงของ polygon (เป็นพิกเซลบนจอ)
function distanceToLayerEdgePx(latlng, layer) {
  try {
    if (window.turf && layer.toGeoJSON) {
      const geo = layer.toGeoJSON();
      if (geo.geometry && (geo.geometry.type === 'Polygon' || geo.geometry.type === 'MultiPolygon')) {
        const line = turf.polygonToLine(geo);
        const pt = turf.point([latlng.lng, latlng.lat]);
        let nearestLatLng = null;

        if (line.type === 'FeatureCollection') {
          let bestDist = Infinity;
          line.features.forEach(f => {
            const np = turf.nearestPointOnLine(f, pt);
            if (np.properties.dist < bestDist) {
              bestDist = np.properties.dist;
              nearestLatLng = L.latLng(np.geometry.coordinates[1], np.geometry.coordinates[0]);
            }
          });
        } else {
          const np = turf.nearestPointOnLine(line, pt);
          nearestLatLng = L.latLng(np.geometry.coordinates[1], np.geometry.coordinates[0]);
        }

        if (nearestLatLng) {
          const p1 = map.latLngToContainerPoint(latlng);
          const p2 = map.latLngToContainerPoint(nearestLatLng);
          return p1.distanceTo(p2);
        }
      }
    }
  } catch (e) {}
  const center = getLayerCenter(layer);
  if (!center) return Infinity;
  const p1 = map.latLngToContainerPoint(latlng);
  const p2 = map.latLngToContainerPoint(center);
  return p1.distanceTo(p2);
}

function pointInLayer(latlng, layer) {
  // กรองเร็ว: จุดคลิกไม่อยู่ในกรอบ (bbox) ของแปลง → ไม่ต้องรัน turf เลย
  if (layer.getBounds && !layer.getBounds().contains(latlng)) return false;
  try {
    if (window.turf && layer.toGeoJSON) {
      const geo = layer.toGeoJSON();
      if (geo.geometry && (geo.geometry.type === 'Polygon' || geo.geometry.type === 'MultiPolygon')) {
        const pt = turf.point([latlng.lng, latlng.lat]);
        // ignoreBoundary: true → จุดที่อยู่บนขอบ/มุมร่วมไม่นับว่า "อยู่ในแปลง"
        // ป้องกันกรณีแปลงติดกันแล้วจุดเดียวถูกนับว่าเข้าในหลายแปลง
        return turf.booleanPointInPolygon(pt, geo, { ignoreBoundary: true });
      }
    }
  } catch (e) {}
  return layer.getBounds ? layer.getBounds().contains(latlng) : false;
}

function findParcelAt(latlng, group, maxNearDistPx = 65, showPicker = false) {
  let __debugCount = 0;
  group.eachLayer(() => __debugCount++);
  console.log(`[findParcelAt] group มี ${__debugCount} features, คลิกที่`, latlng);

  // จุดคลิกเป็นพิกเซลบนจอ (ใช้คัดแปลงที่ไกลออกโดยไม่ต้องรัน turf)
  const cp = map.latLngToContainerPoint(latlng);

  // 1) ผ่านทีเดียว: คัดแปลงที่ bbox ห่างจากจุดเกิน maxNearDistPx px ทิ้งก่อน
  //    → เหลือเฉพาะแปลงที่ "อยู่ใกล้จริงๆ" เท่านั้นที่เข้า turf
  const exactMatches = [];
  const nearLayers = [];

  group.eachLayer(layer => {
    if (!layer.getBounds) return;

    const b = layer.getBounds();
    const bsw = map.latLngToContainerPoint(b.getSouthWest());
    const bne = map.latLngToContainerPoint(b.getNorthEast());
    const minX = Math.min(bsw.x, bne.x) - maxNearDistPx;
    const maxX = Math.max(bsw.x, bne.x) + maxNearDistPx;
    const minY = Math.min(bsw.y, bne.y) - maxNearDistPx;
    const maxY = Math.max(bsw.y, bne.y) + maxNearDistPx;
    if (cp.x < minX || cp.x > maxX || cp.y < minY || cp.y > maxY) return;

    if (b.contains(latlng)) {
      if (pointInLayer(latlng, layer)) exactMatches.push(layer);
    } else {
      nearLayers.push(layer);
    }
  });

  console.log(`[findParcelAt] exactMatches: ${exactMatches.length}`,
    exactMatches.map(l => l.feature?.properties?.parcel_code || '(no code)'));

  if (exactMatches.length === 1) return exactMatches[0];

  // 2) จุดอยู่ในหลายแปลงพร้อมกัน (แปลงติดกัน/ทับซ้อน)
  //    → เลือกแปลงที่จุดอยู่ "ลึกที่สุด" = ระยะ (px) ถึงขอบของตัวเองไกลสุด
  //    แปลงที่จุดอยู่ลึกสุดคือแปลงที่ผู้ใช้หมายถึงแน่ที่สุด
  if (exactMatches.length > 1) {
    let best = null, bestDepth = -1;
    exactMatches.forEach(layer => {
      const depth = distanceToLayerEdgePx(latlng, layer);
      if (depth > bestDepth) { bestDepth = depth; best = layer; }
    });
    return best;
  }

  // 3) fallback หาแปลงที่ขอบใกล้สุดในระยะไม่เกิน maxNearDistPx พิกเซล
  const nearCandidates = [];
  nearLayers.forEach(layer => {
    const distPx = distanceToLayerEdgePx(latlng, layer);
    if (distPx < maxNearDistPx) nearCandidates.push({ layer, distPx });
  });

  if (!nearCandidates.length) {
    console.log(`[findParcelAt] fallback → ไม่พบเลย (ต้อง < ${maxNearDistPx}px)`);
    return null;
  }

  nearCandidates.sort((a, b) => a.distPx - b.distPx);

  // จุดอยู่บนขอบร่วมของหลายแปลงที่ติดกัน (ระยะเกือบเท่ากัน ~0px)
  // → ใช้จุดศูนย์กลางที่ใกล้สุดเป็นตัวตัดสิน (กันเลือกแบบสุ่ม)
  const bestDist = nearCandidates[0].distPx;

  // เลือกแปลงที่ขอบใกล้สุด (ถ้าระยะเกือบเท่ากัน → ใช้จุดศูนย์กลางตัดสิน)
  const pickNearest = (list) => {
    const bd = list[0].distPx;
    const ties = list.filter(c => c.distPx <= bd + 1);
    if (ties.length > 1) {
      ties.sort((a, b) => {
        const ca = getLayerCenter(a.layer);
        const cb = getLayerCenter(b.layer);
        return (ca ? latlng.distanceTo(ca) : Infinity) - (cb ? latlng.distanceTo(cb) : Infinity);
      });
    }
    return ties[0].layer;
  };

  // กล่องเลือกเอง: คลิกอยู่ระหว่างหลายแปลง → ให้ผู้ใช้เลือกแปลงที่ต้องการ
  const pickFromDialog = (list) => {
    const options = list.slice(0, 5).map((c, i) =>
      `${i + 1}. ${c.layer.feature?.properties?.parcel_code || '(no code)'} (ระยะ ${c.distPx.toFixed(0)}px)`);
    const ans = prompt(
      `คลิกนี้อยู่ระหว่างหลายแปลง\nเลือกแปลงที่ต้องการ:\n\n` +
      `${options.join('\n')}\n\n` +
      `(กดหมาย 1-5 หรือ พิมพ์รหัสแปลง)`,
      "1"
    );
    if (ans === null) return null;
    const trimmed = String(ans).trim();
    const numIdx = parseInt(trimmed, 10);
    if (numIdx >= 1 && numIdx <= list.length) return list[numIdx - 1].layer;
    const byCode = list.find(c => c.layer.feature?.properties?.parcel_code === trimmed);
    if (byCode) return byCode.layer;
    return list[0].layer;
  };

  // จุดอยู่บน/ใกล้ขอบร่วมของหลายแปลงที่ติดกัน (ระยะสองแปลงแรกเกือบเท่ากัน)
  // → ให้ผู้ใช้เลือกเอง (ความแม่นยำไม่ลด)
  const ambiguous = nearCandidates.length >= 2 && (nearCandidates[1].distPx - bestDist) <= 15;

  if (ambiguous && showPicker) {
    const picked = pickFromDialog(nearCandidates.filter(c => c.distPx <= bestDist + 30));
    if (!picked) return null;
    console.log(`[findParcelAt] fallback → เลือกเอง: ${picked.feature?.properties?.parcel_code || '(no code)'} ระยะ ${bestDist.toFixed(1)}px`);
    return picked;
  }

  let result = pickNearest(nearCandidates);

  console.log(`[findParcelAt] fallback → พบ:`,
    result.feature?.properties?.parcel_code || '(no code)',
    `ระยะ ${bestDist.toFixed(1)}px (ต้อง < ${maxNearDistPx}px)`);

  return result;
}

// จุดรีเซ็ตกลางจุดเดียว
function resetAllModes() {
  if (activeEdit) {
    if (typeof activeEdit.disable === 'function') activeEdit.disable();
    activeEdit = null;
  }
  clearEditModeHandlers();

  splitMode = false;
  selectedForSplit = null;

  setMapClickHandler(null);

  styledLayers.forEach(layer => {
    if (layer.setStyle) {
      layer.setStyle({
        color: layer.defaultColor || STYLES.parcel.color,
        weight: 1.4,
        fillOpacity: 0
      });
    }
  });
  styledLayers.clear();

  selectedForMerge = [];
  map.closePopup();

  parcelDataMode = true;

  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(true);
  }
  // 🔧 FIX: ปิด/เปิด interactive ของ parcelLayer/editableGroup เองด้วย (คู่กับ reference layers ด้านบน)
  // กันปัญหาคลิกวางจุด/เลือกแปลงไม่ได้ตอนแปลงถูกล้อมรอบสนิททั้ง 4 ด้าน (ไม่มีช่องว่างให้คลิกทะลุ)
  if (typeof setEditableLayersInteractive === 'function') {
    setEditableLayersInteractive(true);
  }
}

/**
 * Handle feature creation
 */
map.on(L.Draw.Event.CREATED, (e) => {
  if (splitMode && selectedForSplit && e.layerType === 'polyline') {
    const line = e.layer;
    performSplit(selectedForSplit, line);
    splitMode = false;
    selectedForSplit = null;
    activeEdit = null;
    return;
  }
  
  const layer = e.layer;
  activeEdit = null;
  
  layer.feature = layer.feature || { 
    type: "Feature", 
    properties: {
      parcel_code: `NEW_${Date.now()}`, 
      zone: "", 
      block: "", 
      lot: "", 
      area: "",
      created_at: new Date().toISOString()
    }
  };
  
  if (layer instanceof L.Polygon) {
    const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
    layer.feature.properties.area = calculateThaiArea(area);
  }
  
  const zone = prompt("โซน (zone):", "");
  const block = prompt("บลอค (block):", "");
  const lot = prompt("ล็อต (lot):", "");
  const parcelCode = prompt("รหัสแปลง (parcel_code):", `${zone}${block}${lot}`);
  if (!parcelCode) return;
  
  const survey = prompt("survey:", "-");
  const landNo = prompt("land_no:", "-");
  const mapsheet = prompt("Mapsheet:", "-");
  const landType = prompt("land_type:", "สปก 4-01");
  const scale = prompt("Scale:", "-");
  
  layer.feature.properties = {
    parcel_code: parcelCode,
    zone: zone || "",
    block: block || "",
    lot: lot || "",
    survey: survey || "-",
    land_no: landNo || "-",
    Mapsheet: mapsheet || "-",
    land_type: landType || "-",
    Scale: scale || "-",
    area: layer.feature.properties.area,
    created_at: new Date().toISOString()
  };
  
  editableGroup.addLayer(layer);
  if (parcelLayer) {
    parcelLayer.addLayer(layer);
  }
  
  layer.bindPopup(buildPropsTable(layer.feature.properties));
  layer.openPopup();
  layer.defaultColor = STYLES.parcel.color;
  
  layer.on('click', function(e) {
    if (activeEdit || !parcelDataMode) return;

    // คืนค่าสีเฉพาะแปลงที่ไฮไลต์ไว้ก่อนหน้า (แทนการวนทุกแปลงใน parcelLayer
    // ซึ่งถ้าแปลงเยอะ เช่น 8827 แปลง จะค้างหนักมาก)
    lastHighlighted.forEach(l => {
      if (l !== layer && l.setStyle) {
        l.setStyle({
          color: l.defaultColor || STYLES.parcel.color,
          weight: 1.4,
          fillOpacity: 0
        });
      }
    });
    const li = lastHighlighted.indexOf(layer);
    if (li !== -1) lastHighlighted.splice(li, 1);
    lastHighlighted.push(layer);

    if (layer.setStyle) {
      layer.setStyle({
        color: '#ff6b6b',
        weight: 2.5,
        fillOpacity: 0.15,
        fillColor: '#ff6b6b'
      });
    }
  });
  
  layer.on('popupclose', function() {
    setTimeout(() => {
      if (layer.setStyle && !lastHighlighted.includes(layer)) {
        layer.setStyle({
          color: layer.defaultColor || STYLES.parcel.color,
          weight: 1.4,
          fillOpacity: 0
        });
      }
    }, 100);
  });
  
  console.log("✅ Created:", layer.feature.properties.parcel_code);

  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(true);
  }
  // 🔧 FIX: ปิด/เปิด interactive ของ parcelLayer/editableGroup เองด้วย (คู่กับ reference layers ด้านบน)
  // กันปัญหาคลิกวางจุด/เลือกแปลงไม่ได้ตอนแปลงถูกล้อมรอบสนิททั้ง 4 ด้าน (ไม่มีช่องว่างให้คลิกทะลุ)
  if (typeof setEditableLayersInteractive === 'function') {
    setEditableLayersInteractive(true);
  }
});

/**
 * Handle feature editing
 */
map.on(L.Draw.Event.EDITED, (e) => {
  const layers = e.layers;
  console.log(`✅ Edited ${layers.getLayers().length} features`);
  
  layers.eachLayer(layer => {
    if (layer.feature && layer.feature.properties) {
      layer.feature.properties.updated_at = new Date().toISOString();
      
      if (layer instanceof L.Polygon) {
        const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
        layer.feature.properties.area = `${(area / 1600).toFixed(2)} ไร่`;
      }
      
      layer.setPopupContent(buildPropsTable(layer.feature.properties));
    }
  });
});

/**
 * Handle feature deletion
 */
map.on(L.Draw.Event.DELETED, (e) => {
  console.log(`🗑️ Deleted ${e.layers.getLayers().length} features`);
  
  e.layers.eachLayer(layer => {
    cleanupLayer(layer);
    if (parcelLayer && parcelLayer.hasLayer(layer)) {
      parcelLayer.removeLayer(layer);
    }
  });
});

/**
 * Button: Draw new polygon
 */
$("btnDraw").onclick = () => {
  resetAllModes();
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(false);
  }
  // 🔧 FIX: ปิด/เปิด interactive ของ parcelLayer/editableGroup เองด้วย (คู่กับ reference layers ด้านบน)
  // กันปัญหาคลิกวางจุด/เลือกแปลงไม่ได้ตอนแปลงถูกล้อมรอบสนิททั้ง 4 ด้าน (ไม่มีช่องว่างให้คลิกทะลุ)
  if (typeof setEditableLayersInteractive === 'function') {
    setEditableLayersInteractive(false);
  }
  activeEdit = new L.Draw.Polygon(map, drawControl.options.draw.polygon);
  activeEdit.enable();
  console.log("🟢 Draw mode activated");
  alert("โหมดวาดแปลง\nคลิกบนแผนที่เพื่อวาดรูปหลายเหลี่ยม");
};

/**
 * Button: Edit feature properties (เพิ่มระบบ Hover ไฮไลต์แปลงก่อนคลิก)
 */
$("btnEdit").onclick = () => {
  // ล้างโหมดอื่นที่อาจค้างอยู่ก่อน (วาด/แบ่ง/รวม)
  resetAllModes();
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(false);
  }
  // 🔧 FIX: ปิด/เปิด interactive ของ parcelLayer/editableGroup เองด้วย (คู่กับ reference layers ด้านบน)
  // กันปัญหาคลิกวางจุด/เลือกแปลงไม่ได้ตอนแปลงถูกล้อมรอบสนิททั้ง 4 ด้าน (ไม่มีช่องว่างให้คลิกทะลุ)
  if (typeof setEditableLayersInteractive === 'function') {
    setEditableLayersInteractive(false);
  }
  parcelDataMode = false;
  map.closePopup();

  alert("โหมดแก้ไขข้อมูล\nเลื่อนเมาส์ชี้แปลงที่ต้องการแก้ไขแล้วคลิก");
  console.log("✏️ Edit data mode activated");

  // ============================================================
  // 👇 ระบบ Hover ไฮไลต์แปลงก่อนคลิก
  // ============================================================
  let hoveredLayerForEdit = null;
  let hoverActive = false;

  const mouseMoveHandler = (e) => {
    const layer = findParcelAt(e.latlng, editableGroup, 55);

    if (hoveredLayerForEdit && hoveredLayerForEdit !== layer) {
      hoveredLayerForEdit.setStyle({
        color: hoveredLayerForEdit.defaultColor || STYLES.parcel.color,
        weight: 1.4,
        fillOpacity: 0
      });
      styledLayers.delete(hoveredLayerForEdit);
    }

    if (layer) {
      layer.setStyle({
        color: '#3388ff',
        weight: 2,
        fillOpacity: 0.15,
        fillColor: '#3388ff'
      });
      styledLayers.add(layer);
      hoveredLayerForEdit = layer;
    } else {
      hoveredLayerForEdit = null;
    }
  };

  const throttledHover = throttleAnimFrame(mouseMoveHandler);

  const enableHover = () => {
    if (!hoverActive) {
      map.on('mousemove', throttledHover);
      hoverActive = true;
    }
  };
  const disableHover = () => {
    if (hoverActive) {
      map.off('mousemove', throttledHover);
      throttledHover.cancel();
      hoverActive = false;
    }
  };

  enableHover();
  // 🔧 เก็บ mousemove handler ไว้ใน editModeHandlers เพื่อให้ resetAllModes() เคลียร์ได้จริง
  editModeHandlers.push({ isMap: true, event: 'mousemove', handler: throttledHover });
  // ============================================================

  // 🔧 FIX (กดติดยากเมื่อแปลงติดกันทั้ง 4 ด้าน): ใช้ setMapClickHandler + findParcelAt()
  const editClickHandler = (e) => {
    console.log("✏️ [EDIT] click fired at", e.latlng);
    const layer = findParcelAt(e.latlng, editableGroup, 65, true);
    console.log("✏️ [EDIT] findParcelAt →", layer ? (layer.feature?.properties?.parcel_code || '(no code)') : 'NULL');

    if (!layer || !layer.feature) {
      console.log("⚠️ No parcel found. Click closer to parcel.");
      alert("ไม่พบแปลง\nคลิกใกล้ๆ แปลงมากขึ้น");
      return;
    }

    // ปิด popup ดูข้อมูลทิ้ง เพื่อไม่ให้ทับแปลง/แย่งโหมดแก้ไข
    map.closePopup();

    // 🔧 ปิด hover ระหว่างกรอกข้อมูล
    disableHover();
    if (hoveredLayerForEdit) {
      hoveredLayerForEdit.setStyle({
        color: hoveredLayerForEdit.defaultColor || STYLES.parcel.color,
        weight: 1.4,
        fillOpacity: 0
      });
      styledLayers.delete(hoveredLayerForEdit);
      hoveredLayerForEdit = null;
    }

    const resetLayerStyle = () => {
      layer.setStyle({
        color: layer.defaultColor || STYLES.parcel.color,
        weight: 1.4,
        fillOpacity: 0
      });
      styledLayers.delete(layer);
      // 🔧 เปิด hover กลับมา เพื่อให้แก้ไขแปลงถัดไปได้ทันที
      enableHover();
    };

    const props = layer.feature.properties;
const confirmEdit = confirm(
      `แก้ไขข้อมูลแปลง: ${props.parcel_code || "(ไม่มีรหัส)"}\n\n` +
      `ใช่แปลงที่ต้องการหรือไม่?\n` +
      `(กด OK = ใช่ แ้ไขต่อ, Cancel = ไม่ใช่ คลิกแปลงใหม่)`
    );
    console.log("✏️ [EDIT] confirm →", confirmEdit);
    if (!confirmEdit) {
      resetLayerStyle();
      return;
    }

    // Highlight
    layer.setStyle({ color: 'blue', weight: 3, fillOpacity: 0.2 });
    styledLayers.add(layer);

    // Prompt for each field
    const zone = prompt("zone:", props.zone || "");
    if (zone === null) { resetLayerStyle(); return; }

    const block = prompt("block:", props.block || "");
    if (block === null) { resetLayerStyle(); return; }

    const lot = prompt("lot:", props.lot || "");
    if (lot === null) { resetLayerStyle(); return; }

    const parcelCode = prompt("parcel_code:", props.parcel_code || "");
    if (parcelCode === null) { resetLayerStyle(); return; }

    const survey = prompt("survey:", props.survey || "-");
    const landNo = prompt("land_no:", props.land_no || "-");
    const mapsheet = prompt("Mapsheet:", props.Mapsheet || "-");
    const landType = prompt("land_type:", props.land_type || "-");
    const scale = prompt("Scale:", props.Scale || "-");

    layer.feature.properties.zone = zone;
    layer.feature.properties.block = block;
    layer.feature.properties.lot = lot;
    layer.feature.properties.parcel_code = parcelCode;
    layer.feature.properties.survey = survey;
    layer.feature.properties.land_no = landNo;
    layer.feature.properties.Mapsheet = mapsheet;
    layer.feature.properties.land_type = landType;
    layer.feature.properties.Scale = scale;

    layer.setPopupContent(buildPropsTable(layer.feature.properties));
    layer.openPopup();

    setTimeout(resetLayerStyle, 500);

    alert("✅ แก้ไขข้อมูลแล้ว\nอย่าลืมกด 💾 บันทึก");
    console.log("✅ Properties updated:", parcelCode);
  };

  setMapClickHandler(editClickHandler);
};

/**
 * Button: Stop edit mode
 */
$("btnStop").onclick = () => {
  resetAllModes();
  console.log("⛔ All modes stopped");
};

/**
 * Button: Split parcel (เพิ่มระบบ Hover ไฮไลต์แปลงก่อนคลิก)
 */
$("btnSplit").onclick = () => {
  if (!window.turf) {
    alert("ไม่สามารถใช้งานฟังก์ชันนี้ได้\nต้องการ Turf.js library");
    return;
  }
  
  // Force reset everything first (โหมดอื่นด้วย ไม่ใช่แค่ split)
  resetAllModes();
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(false);
  }
  // 🔧 FIX: ปิด/เปิด interactive ของ parcelLayer/editableGroup เองด้วย (คู่กับ reference layers ด้านบน)
  // กันปัญหาคลิกวางจุด/เลือกแปลงไม่ได้ตอนแปลงถูกล้อมรอบสนิททั้ง 4 ด้าน (ไม่มีช่องว่างให้คลิกทะลุ)
  if (typeof setEditableLayersInteractive === 'function') {
    setEditableLayersInteractive(false);
  }
  
  // Now start split mode
  splitMode = true;
  parcelDataMode = false;
  map.closePopup();
  
  alert("โหมดแบ่งแปลง\nเลื่อนเมาส์ชี้แปลงที่ต้องการแล้วคลิกเลือก");
  console.log("✂️ Split mode: waiting for parcel selection");
  
  // ============================================================
  // 👇 ระบบ Hover ไฮไลต์แปลงก่อนคลิก
  // ============================================================
  let hoveredLayerForSplit = null;
  
  const mouseMoveHandler = (e) => {
    const closestLayer = findParcelAt(e.latlng, editableGroup, 55);
    
    // คืนค่าสีแปลงเก่าที่เคยถูกชี้ (ถ้าไม่ใช่ตัวเดิม และไม่ใช่ตัวที่เลือกไว้แล้ว)
    if (hoveredLayerForSplit && hoveredLayerForSplit !== closestLayer && hoveredLayerForSplit !== selectedForSplit) {
      hoveredLayerForSplit.setStyle({
        color: hoveredLayerForSplit.defaultColor || STYLES.parcel.color,
        weight: 1.4,
        fillOpacity: 0
      });
      styledLayers.delete(hoveredLayerForSplit);
    }
    
    // ไฮไลต์แปลงที่เมาส์กำลังชี้อยู่ (สีฟ้าอ่อน)
    if (closestLayer && closestLayer !== selectedForSplit) {
      closestLayer.setStyle({
        color: '#3388ff',
        weight: 2,
        fillOpacity: 0.15,
        fillColor: '#3388ff'
      });
      styledLayers.add(closestLayer);
      hoveredLayerForSplit = closestLayer;
    } else if (!closestLayer) {
      hoveredLayerForSplit = null;
    }
  };
  
  const throttledHover = throttleAnimFrame(mouseMoveHandler);

  map.on('mousemove', throttledHover);
  // 🔧 เก็บ mousemove handler ไว้ใน editModeHandlers เพื่อให้ resetAllModes() เคลียร์ได้จริง
  editModeHandlers.push({ isMap: true, event: 'mousemove', handler: throttledHover });
  // ============================================================
  
  // Click to select parcel
  const clickHandler = (e) => {
    console.log("✂️ [SPLIT] click fired at", e.latlng);
    const closestLayer = findParcelAt(e.latlng, editableGroup, 65, true);
    console.log("✂️ [SPLIT] findParcelAt →", closestLayer ? (closestLayer.feature?.properties?.parcel_code || '(no code)') : 'NULL');
    
    if (closestLayer) {
      // 🔧 ปิด mousemove เมื่อเลือกแปลงได้แล้ว (กัน hover ค้าง)
      map.off('mousemove', throttledHover);
      throttledHover.cancel();
      
      // คืนค่าสีของ hoveredLayerForSplit ก่อนเปลี่ยนเป็นสีส้ม (ถ้าเป็นตัวเดียวกันจะได้ไม่ทับ)
      if (hoveredLayerForSplit && hoveredLayerForSplit !== closestLayer) {
        hoveredLayerForSplit.setStyle({
          color: hoveredLayerForSplit.defaultColor || STYLES.parcel.color,
          weight: 1.4,
          fillOpacity: 0
        });
        styledLayers.delete(hoveredLayerForSplit);
      }
      hoveredLayerForSplit = null;
      
      selectedForSplit = closestLayer;
      closestLayer.setStyle({ color: 'orange', weight: 3, fillOpacity: 0.2 });
      styledLayers.add(closestLayer);
      // ปิด popup ดูข้อมูลที่อาจเปิดค้างอยู่ทับแปลง ก่อนเริ่มวาดเส้น
      // (ไม่งั้นคลิกแรกของการวาดเส้นจะไปโดน popup แทนแผนที่)
      map.closePopup();
      
      console.log("✅ Parcel selected, draw line to split");
      alert("เลือกแปลงแล้ว ✓\nวาดเส้นตัดผ่านแปลง");
      
      // Enable line drawing
      activeEdit = new L.Draw.Polyline(map, {
        shapeOptions: {
          color: 'red',
          weight: 3,
          dashArray: '10, 10'
        }
      });
      activeEdit.enable();
      
      setMapClickHandler(null);
    } else {
      console.log("⚠️ No parcel found. Click closer to parcel.");
      alert("ไม่พบแปลง\nคลิกใกล้ๆ แปลงมากขึ้น");
    }
  };
  
  setMapClickHandler(clickHandler);
};

/**
 * Button: Merge parcels
 */
$("btnMerge").onclick = () => {
  if (!window.turf) {
    alert("ไม่สามารถใช้งานฟังก์ชันนี้ได้\nต้องการ Turf.js library");
    return;
  }
  
  resetAllModes();
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(false);
  }
  // 🔧 FIX: ปิด/เปิด interactive ของ parcelLayer/editableGroup เองด้วย (คู่กับ reference layers ด้านบน)
  // กันปัญหาคลิกวางจุด/เลือกแปลงไม่ได้ตอนแปลงถูกล้อมรอบสนิททั้ง 4 ด้าน (ไม่มีช่องว่างให้คลิกทะลุ)
  if (typeof setEditableLayersInteractive === 'function') {
    setEditableLayersInteractive(false);
  }
  parcelDataMode = false;
  map.closePopup();
  
  alert("โหมดรวมแปลง\nคลิกเลือกแปลง 2 แปลงขึ้นไป\nแล้วกดปุ่ม 'รวมแปลง' อีกครั้ง");
  console.log("🔗 Merge mode: select parcels");

  // ============================================================
  // 👇 ระบบ Hover ไฮไลต์แปลงก่อนคลิก
  // ============================================================
  let hoveredLayerForMerge = null;

  const mouseMoveHandler = (e) => {
    const closestLayer = findParcelAt(e.latlng, editableGroup, 55);

    // คืนค่าสีแปลงเก่าที่เคยถูกชี้ (ถ้าไม่ใช่ตัวเดิม และไม่ใช่แปลงที่เลือกไว้แล้ว
    // เพื่อไม่ให้ hover ไปทับสีน้ำเงินของแปลงที่เลือกค้างไว้)
    if (hoveredLayerForMerge && hoveredLayerForMerge !== closestLayer && !selectedForMerge.includes(hoveredLayerForMerge)) {
      hoveredLayerForMerge.setStyle({
        color: hoveredLayerForMerge.defaultColor || STYLES.parcel.color,
        weight: 1.4,
        fillOpacity: 0
      });
      styledLayers.delete(hoveredLayerForMerge);
    }

    // ไฮไลต์แปลงที่เมาส์กำลังชี้อยู่ (สีฟ้าอ่อน) ยกเว้นแปลงที่เลือกไว้แล้ว (สีน้ำเงิน)
    if (closestLayer && !selectedForMerge.includes(closestLayer)) {
      closestLayer.setStyle({
        color: '#3388ff',
        weight: 2,
        fillOpacity: 0.15,
        fillColor: '#3388ff'
      });
      styledLayers.add(closestLayer);
      hoveredLayerForMerge = closestLayer;
    } else {
      // ไม่มีแปลงใต้เมาส์ หรือแปลงนั้นถูกเลือกไว้แล้ว (สีน้ำเงิน) → ไม่ต้องไฮไลต์ hover ทับ
      hoveredLayerForMerge = null;
    }
  };

  const throttledHover = throttleAnimFrame(mouseMoveHandler);

  map.on('mousemove', throttledHover);
  // 🔧 เก็บ mousemove handler ไว้ใน editModeHandlers เพื่อให้ resetAllModes() เคลียร์ได้จริง
  editModeHandlers.push({ isMap: true, event: 'mousemove', handler: throttledHover });
  // ============================================================

  const mergeClickHandler = (e) => {
    console.log("🔗 [MERGE] click fired at", e.latlng);
    const layer = findParcelAt(e.latlng, editableGroup, 65, true);
    console.log("🔗 [MERGE] findParcelAt →", layer ? (layer.feature?.properties?.parcel_code || '(no code)') : 'NULL');
    if (!layer) return;

    // ปิด popup ดูข้อมูลทิ้ง เพื่อไม่ให้ทับแปลง/แย่งโหมดรวม
    map.closePopup();

    // แปลงที่เพิ่งคลิกไม่ใช่ hover ที่ค้างอยู่แล้ว (กันสถานะ hover เพี้ยน)
    if (hoveredLayerForMerge === layer) hoveredLayerForMerge = null;

    if (selectedForMerge.includes(layer)) {
      layer.setStyle({ 
        color: layer.defaultColor || STYLES.parcel.color, 
        weight: 1.4 
      });
      styledLayers.delete(layer);
      selectedForMerge = selectedForMerge.filter(l => l !== layer);
      console.log(`❌ Deselected. Total: ${selectedForMerge.length}`);
    } else {
      layer.setStyle({ color: 'blue', weight: 3 });
      styledLayers.add(layer);
      selectedForMerge.push(layer);
      console.log(`✅ Selected. Total: ${selectedForMerge.length}`);
    }

    if (selectedForMerge.length >= 2) {
      const confirm = window.confirm(`เลือกแล้ว ${selectedForMerge.length} แปลง\nรวมเลยไหม?`);
      if (confirm) {
        // 🔧 ปิด mousemove ก่อนเริ่มรวมแปลงจริง (กัน hover ค้าง)
        map.off('mousemove', throttledHover);
        throttledHover.cancel();
        setMapClickHandler(null);
        performMerge();
      }
    }
  };
  
  setMapClickHandler(mergeClickHandler);
};

/**
 * Perform split operation
 */
function performSplit(polygon, line) {
  console.log("🔄 Starting split operation...");

  try {
    const poly = polygon.toGeoJSON();
    const lineGeo = line.toGeoJSON();

    console.log("📏 Buffering line...");
    const buffered = turf.buffer(lineGeo, 0.0005, { units: 'kilometers' });

    console.log("✂️ Splitting polygon...");
    const split = turf.difference(poly, buffered);

    if (!split || split.geometry.type === 'GeometryCollection') {
      alert("ไม่สามารถแบ่งแปลงได้\nลองวาดเส้นตัดให้ทะลุขอบทั้งสองข้าง");
      return;
    }

    cleanupLayer(polygon);
    if (editableGroup.hasLayer(polygon)) editableGroup.removeLayer(polygon);
    if (parcelLayer && parcelLayer.hasLayer(polygon)) parcelLayer.removeLayer(polygon);

    const parts = split.geometry.type === 'MultiPolygon'
      ? split.geometry.coordinates
      : [split.geometry.coordinates];

    console.log(`📦 สร้างแปลงใหม่ ${parts.length} แปลง...`);

    parts.forEach((coords, i) => {
      const latlngs = coords[0].map(coord => L.latLng(coord[1], coord[0]));

      const areaSqM = L.GeometryUtil.geodesicArea(latlngs);
      const thaiArea = calculateThaiArea(areaSqM);

      const newPoly = L.polygon(latlngs, {
        color: STYLES.parcel.color,
        weight: 2,
        fillOpacity: 0.2
      });

      newPoly.feature = {
        type: "Feature",
        properties: {
          ...polygon.feature.properties,
          parcel_code: `${polygon.feature.properties.parcel_code}_ส่วน${i + 1}`,
          area: thaiArea,
          split_at: new Date().toISOString()
        }
      };

      editableGroup.addLayer(newPoly);
      if (parcelLayer) parcelLayer.addLayer(newPoly);

      newPoly.bindPopup(buildPropsTable(newPoly.feature.properties));
      newPoly.defaultColor = STYLES.parcel.color;

      newPoly.on('click', function(e) {
        if (activeEdit) return;
      });
    });

    splitMode = false;
    selectedForSplit = null;

    alert(`✅ แบ่งแปลงสำเร็จ! ได้ ${parts.length} แปลงใหม่\nพื้นที่คำนวณใหม่แบบไทยเรียบร้อย`);
    console.log("✅ Split completed successfully");

  } catch (e) {
    console.error("❌ Split error:", e);
    alert("เกิดข้อผิดพลาดในการแบ่งแปลง\n" + (e.message || e));
    splitMode = false;
    selectedForSplit = null;
  } finally {
    if (typeof setReferenceLayersInteractive === 'function') {
      setReferenceLayersInteractive(true);
    }
    // 🔧 FIX: ปิด/เปิด interactive ของ parcelLayer/editableGroup เองด้วย (คู่กับ reference layers ด้านบน)
    // กันปัญหาคลิกวางจุด/เลือกแปลงไม่ได้ตอนแปลงถูกล้อมรอบสนิททั้ง 4 ด้าน (ไม่มีช่องว่างให้คลิกทะลุ)
    if (typeof setEditableLayersInteractive === 'function') {
      setEditableLayersInteractive(true);
    }
  }
}

/**
 * Perform merge operation
 */
function performMerge() {
  if (selectedForMerge.length < 2) {
    alert("กรุณาเลือกอย่างน้อย 2 แปลง");
    return;
  }

  try {
    console.log(`🔗 พยายามรวม ${selectedForMerge.length} แปลง`);

    const validLayers = selectedForMerge.filter(layer => {
      if (!layer || typeof layer.toGeoJSON !== 'function') {
        console.warn("Layer ไม่ถูกต้อง:", layer);
        return false;
      }
      
      const geo = layer.toGeoJSON();
      
      if (!geo || !geo.geometry || !geo.geometry.coordinates) {
        console.warn("GeoJSON ไม่สมบูรณ์:", geo);
        return false;
      }

      const coords = geo.geometry.coordinates;
      if (geo.geometry.type === 'Polygon') {
        if (!coords[0] || coords[0].length < 4) {
          console.warn("Polygon ไม่สมบูรณ์");
          return false;
        }
      } else if (geo.geometry.type === 'MultiPolygon') {
        if (!coords[0] || !coords[0][0] || coords[0][0].length < 4) {
          console.warn("MultiPolygon ไม่สมบูรณ์");
          return false;
        }
      } else {
        console.warn("รองรับเฉพาะ Polygon และ MultiPolygon");
        return false;
      }

      return true;
    });

    if (validLayers.length < 2) {
      throw new Error(
        `มีแปลงที่ใช้งานได้เพียง ${validLayers.length} จาก ${selectedForMerge.length} แปลง\n\n` +
        `กรุณาตรวจสอบว่าแปลงมีจุดครบ 4 จุดและวาดสมบูรณ์`
      );
    }

    console.log(`✅ พบ ${validLayers.length} แปลงที่ valid`);

    const features = validLayers.map(layer => {
      const geoJSON = layer.toGeoJSON();
      return {
        type: 'Feature',
        geometry: geoJSON.geometry,
        properties: geoJSON.properties || {}
      };
    });

    console.log("🔧 ใช้ buffer เพื่อปิดช่องว่างระหว่างแปลง...");
    
    const bufferedFeatures = features.map((feature, idx) => {
      try {
        const buffered = turf.buffer(feature, 0.001, { units: 'kilometers' });
        console.log(`  ✓ Buffer แปลงที่ ${idx + 1}`);
        return buffered;
      } catch (err) {
        console.warn(`  ⚠️ ไม่สามารถ buffer แปลงที่ ${idx + 1}:`, err.message);
        return feature;
      }
    });

    console.log("🔗 เริ่มกระบวนการรวม...");
    let merged = bufferedFeatures[0];

    for (let i = 1; i < bufferedFeatures.length; i++) {
      console.log(`  รวมแปลงที่ ${i + 1}/${bufferedFeatures.length}...`);
      
      try {
        const unionResult = turf.union(merged, bufferedFeatures[i]);
        
        if (!unionResult || !unionResult.geometry) {
          throw new Error(`ไม่สามารถรวมแปลงที่ ${i + 1} ได้`);
        }

        merged = unionResult;
        console.log(`  ✓ รวมสำเร็จ (${merged.geometry.type})`);
        
      } catch (unionErr) {
        console.error(`  ✗ รวมล้มเหลว:`, unionErr);
        throw new Error(
          `ไม่สามารถรวมแปลงที่ ${i + 1} ได้\n\n` +
          `สาเหตุ: ${unionErr.message}\n\n` +
          `คำแนะนำ:\n` +
          `• แปลงอาจห่างกันเกินไป (มากกว่า 1 เมตร)\n` +
          `• ลองวาดแปลงให้ชิดกันมากขึ้น`
        );
      }
    }

    console.log("🎯 ลด buffer กลับเพื่อให้ได้ขนาดเดิม...");
    try {
      const unbuffered = turf.buffer(merged, -0.0005, { units: 'kilometers' });
      
      if (unbuffered && unbuffered.geometry) {
        merged = unbuffered;
        console.log("  ✓ ปรับขนาดกลับสำเร็จ");
      }
    } catch (unbufferErr) {
      console.warn("  ⚠️ ไม่สามารถลด buffer กลับได้:", unbufferErr.message);
    }

    if (merged.geometry.type === 'MultiPolygon') {
      console.log("⚠️ ยังเป็น MultiPolygon - พยายาม dissolve...");
      
      try {
        const secondBuffer = turf.buffer(merged, 0.0001, { units: 'kilometers' });
        const collection = turf.featureCollection([secondBuffer]);
        const dissolved = turf.dissolve(collection);
        
        if (dissolved && dissolved.features && dissolved.features[0]) {
          if (dissolved.features[0].geometry.type === 'Polygon') {
            merged = dissolved.features[0];
            console.log("  ✓ Dissolve สำเร็จ");
          }
        }
      } catch (dissolveErr) {
        console.warn("  ⚠️ Dissolve ไม่สำเร็จ:", dissolveErr.message);
      }
    }

    if (merged.geometry.type === 'MultiPolygon') {
      const polyCount = merged.geometry.coordinates.length;
      const proceed = confirm(
        `⚠️ ผลลัพธ์เป็น ${polyCount} ส่วนแยกกัน\n\n` +
        `แปลงอาจมีช่องว่างระหว่างกันมากเกินไป\n\n` +
        `ต้องการใช้แปลงที่ใหญ่ที่สุดไหม?\n` +
        `(กด OK = ใช้, Cancel = ยกเลิก)`
      );
      
      if (!proceed) {
        throw new Error("ผู้ใช้ยกเลิกการรวมแปลง");
      }
      
      console.log("  → เลือกแปลงที่ใหญ่ที่สุด");
      let maxArea = 0;
      let maxIndex = 0;
      
      merged.geometry.coordinates.forEach((poly, idx) => {
        const area = turf.area(turf.polygon(poly));
        if (area > maxArea) {
          maxArea = area;
          maxIndex = idx;
        }
      });
      
      merged = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: merged.geometry.coordinates[maxIndex]
        },
        properties: merged.properties
      };
    }

    const latlngs = merged.geometry.coordinates[0].map(coord => 
      L.latLng(coord[1], coord[0])
    );

    const areaSqM = L.GeometryUtil.geodesicArea(latlngs);
    const thaiArea = calculateThaiArea(areaSqM);

    const newLayer = L.polygon(latlngs, {
      color: STYLES.parcel.color,
      weight: 2,
      fillOpacity: 0.2
    });

    const baseProps = validLayers[0].feature?.properties || {};
    const mergedParcelCodes = validLayers
      .map(l => l.feature?.properties?.parcel_code || "ไม่ระบุ")
      .join(", ");

    newLayer.feature = {
      type: "Feature",
      properties: {
        parcel_code: `MERGED_${Date.now()}`,
        zone: baseProps.zone || "",
        block: baseProps.block || "",
        lot: baseProps.lot || "",
        survey: baseProps.survey || "-",
        land_no: baseProps.land_no || "-",
        Mapsheet: baseProps.Mapsheet || "-",
        land_type: baseProps.land_type || "-",
        Scale: baseProps.Scale || "-",
        area: thaiArea,
        merged_from: mergedParcelCodes,
        merged_count: validLayers.length,
        created_at: new Date().toISOString()
      },
      geometry: merged.geometry
    };

    editableGroup.addLayer(newLayer);
    if (parcelLayer) parcelLayer.addLayer(newLayer);

    validLayers.forEach(layer => {
      cleanupLayer(layer);
      if (editableGroup.hasLayer(layer)) editableGroup.removeLayer(layer);
      if (parcelLayer && parcelLayer.hasLayer(layer)) {
        parcelLayer.removeLayer(layer);
      }
    });

    selectedForMerge = [];
    
    newLayer.bindPopup(buildPropsTable(newLayer.feature.properties));
    newLayer.openPopup();
    newLayer.defaultColor = STYLES.parcel.color;

    const successMsg = 
      `✅ รวม ${validLayers.length} แปลงสำเร็จ!\n\n` +
      `พื้นที่รวม: ${thaiArea}\n` +
      `รหัสเดิม: ${mergedParcelCodes.substring(0, 50)}${mergedParcelCodes.length > 50 ? '...' : ''}`;
    
    alert(successMsg);
    console.log("🎉 Merge สำเร็จ - ใช้เทคนิค buffer-merge-unbuffer");

  } catch (err) {
    console.error("❌ Merge ล้มเหลว:", err);
    alert("❌ ไม่สามารถรวมแปลงได้\n\n" + err.message);

    selectedForMerge.forEach(layer => {
      if (layer.setStyle && typeof layer.setStyle === 'function') {
        layer.setStyle({
          color: layer.defaultColor || STYLES.parcel.color,
          weight: 1.4,
          fillOpacity: 0
        });
      }
      styledLayers.delete(layer);
    });
    
    selectedForMerge = [];
  } finally {
    if (typeof setReferenceLayersInteractive === 'function') {
      setReferenceLayersInteractive(true);
    }
    // 🔧 FIX: ปิด/เปิด interactive ของ parcelLayer/editableGroup เองด้วย (คู่กับ reference layers ด้านบน)
    // กันปัญหาคลิกวางจุด/เลือกแปลงไม่ได้ตอนแปลงถูกล้อมรอบสนิททั้ง 4 ด้าน (ไม่มีช่องว่างให้คลิกทะลุ)
    if (typeof setEditableLayersInteractive === 'function') {
      setEditableLayersInteractive(true);
    }
  }
}

/**
 * Button: Reset/Cancel all modes
 */
$("btnDelete").onclick = () => {
  resetAllModes();
  console.log("🔄 All modes reset");
};

console.log("✅ Draw module loaded");