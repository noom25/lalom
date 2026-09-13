/* ====================== DRAW & EDIT TOOLS ====================== */
/**
 * คำนวณพื้นที่เป็นหน่วยไทย (ไร่-งาน-วา) จากพื้นที่ตารางเมตร
 * แสดงผลสวยงาม ไม่มี .00 เกะกะ ถ้าไม่มีเศษวาจะไม่แสดงหน่วยนั้น
 * 
 * @param {number} areaSqM - พื้นที่เป็นตารางเมตร
 * @returns {string} เช่น "5 ไร่ 2 งาน 35.5 วา" หรือ "0 ไร่ 1 งาน 20 วา"
 */
function calculateThaiArea(areaSqM) {
  if (!areaSqM || areaSqM <= 0) return "0 ไร่ 0 งาน 0 วา";

  const rai = Math.floor(areaSqM / 1600);
  const remainingAfterRai = areaSqM % 1600;

  const ngan = Math.floor(remainingAfterRai / 400);
  const remainingAfterNgan = remainingAfterRai % 400;

  const wa = remainingAfterNgan / 4;

  // จัดรูปแบบวาให้สวย
  const waFormatted = wa % 1 === 0 
    ? wa.toFixed(0) 
    : wa.toFixed(2).replace(/\.?0+$/, '');

  // สร้างข้อความผลลัพธ์
  const parts = [];
  if (rai > 0) parts.push(`${rai} ไร่`);
  if (ngan > 0) parts.push(`${ngan} งาน`);
  if (wa > 0) parts.push(`${waFormatted} วา`);

  // กรณีพิเศษ: ถ้าไม่มีไร่ แต่มีงานหรือวา → แสดงงาน/วาให้ครบ
  if (parts.length === 0) return "0 ไร่ 0 งาน 0 วา";
  if (rai === 0 && ngan > 0) parts.unshift("0 ไร่"); // เพิ่ม 0 ไร่ ถ้ามีงาน
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

// 🔧 FIX (ประสิทธิภาพ): เก็บเฉพาะ layer ที่ถูกเปลี่ยนสีไว้จริง (ตอนเลือกแปลงเพื่อ
// แบ่ง/รวม/แก้ไขข้อมูล) แทนที่จะวน editableGroup ทั้งหมด (เป็นพันแปลง) ทุกครั้งที่กด
// "หยุด"/"รีเซ็ต" — เดิมวนทุกแปลงทำให้ resetAllModes() ค้างหลายวินาที (เจอ [Violation]
// 'click' handler took 4335ms ใน console) เพราะ setStyle ของ Leaflet ต้องอัปเดต DOM/Canvas
// ทีละแปลง ยิ่งข้อมูลเยอะยิ่งช้า
let styledLayers = new Set();

// 🔧 FIX (เสถียรภาพ): เก็บ reference ของ map click handler ปัจจุบันไว้ตัวเดียว
// เดิมหลายจุดเรียก map.off('click') แบบไม่ระบุ handler ซึ่งจะลบ click listener
// ของ "ทุกโมดูล" ที่ผูกกับแผนที่ ไม่ใช่แค่ของโหมดวาด/แบ่ง/รวมเท่านั้น
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

// 🔧 FIX (เสถียรภาพ): เก็บ handler ของโหมด "แก้ไขข้อมูล" ไว้ระดับโมดูล เพื่อล้างก่อน
// ผูกชุดใหม่ทุกครั้ง เดิมถ้ากดปุ่ม "แก้ไขข้อมูล" ซ้ำโดยยังไม่ได้คลิกแปลงไหนเลย จะมี
// handler ซ้อนกันหลายชุด คลิกแปลงทีเดียวเจอ prompt วนซ้ำ
let editModeHandlers = [];
function clearEditModeHandlers() {
  editModeHandlers.forEach(h => h.layer.off('click', h.handler));
  editModeHandlers = [];
}

// 🔧 FIX (เลือกแปลงผิดตัว): เดิมเช็คแค่ "กรอบสี่เหลี่ยมล้อมรอบ" (getBounds().contains)
// ไม่ใช่รูปทรงจริงของแปลง ถ้าแปลงข้างเคียงอยู่ติดกัน/เอียง กรอบจะซ้อนทับกัน คลิกมุมแปลง
// หนึ่งอาจไปโดนอีกแปลงแทน ฟังก์ชันนี้เช็ครูปทรงจริงด้วย turf ก่อน ถ้าไม่โดนตัวไหนพอดี
// (เช่น คลิกเฉียดขอบแปลงเล็ก) ค่อย fallback ไปหาแปลงที่ใกล้ที่สุดในระยะที่กำหนด เหมือนเดิม
function pointInLayer(latlng, layer) {
  try {
    if (window.turf && layer.toGeoJSON) {
      const geo = layer.toGeoJSON();
      if (geo.geometry && (geo.geometry.type === 'Polygon' || geo.geometry.type === 'MultiPolygon')) {
        const pt = turf.point([latlng.lng, latlng.lat]);
        return turf.booleanPointInPolygon(pt, geo);
      }
    }
  } catch (e) {
    // คำนวณไม่ได้ (ข้อมูลรูปทรงไม่สมบูรณ์) ให้ fallback ไปเช็คกรอบสี่เหลี่ยมแทน
  }
  return layer.getBounds ? layer.getBounds().contains(latlng) : false;
}

function findParcelAt(latlng, group, maxNearDist = 90) {
  // 1) เช็คจุดตกในรูปทรงจริงก่อน (แม่นยำสุด)
  const exactMatches = [];
  group.eachLayer(layer => {
    if (pointInLayer(latlng, layer)) exactMatches.push(layer);
  });

  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    // เคสซ้อนกันพอดี (หายาก) เลือกตัวที่จุดศูนย์กลางใกล้สุด
    let best = null, bestDist = Infinity;
    exactMatches.forEach(layer => {
      const d = latlng.distanceTo(layer.getBounds().getCenter());
      if (d < bestDist) { bestDist = d; best = layer; }
    });
    return best;
  }

  // 2) ไม่โดนตัวไหนพอดี (คลิกเฉียดขอบ) → หาแปลงที่ใกล้สุดในระยะที่กำหนด เหมือนพฤติกรรมเดิม
  let closestLayer = null, minDist = Infinity;
  group.eachLayer(layer => {
    if (!layer.getBounds) return;
    const dist = latlng.distanceTo(layer.getBounds().getCenter());
    if (dist < maxNearDist && dist < minDist) {
      minDist = dist;
      closestLayer = layer;
    }
  });
  return closestLayer;
}

// 🔧 FIX (เสถียรภาพ): จุดรีเซ็ตกลางจุดเดียว เดิมปุ่มเปิดโหมดแต่ละปุ่ม (วาด/แก้ไขข้อมูล/
// แบ่ง/รวม) reset แค่ตัวแปรของโหมดตัวเอง ทำให้สลับปุ่มระหว่างทำงานโดยไม่กด "หยุด" ก่อน
// มี handler ของโหมดเก่าค้างซ้อนได้ ตอนนี้ทุกปุ่มเรียกจุดนี้ก่อนเริ่มโหมดใหม่เสมอ
function resetAllModes() {
  if (activeEdit) {
    if (typeof activeEdit.disable === 'function') activeEdit.disable();
    activeEdit = null;
  }
  clearEditModeHandlers();

  splitMode = false;
  selectedForSplit = null;

  setMapClickHandler(null);

  // 🔧 FIX (ประสิทธิภาพ): รีเซ็ตสีเฉพาะแปลงที่เคยถูกไฮไลท์จริง (เร็วขึ้นมาก โดยเฉพาะ
  // ข้อมูลที่มีเป็นพันแปลง) แทนการวนทุกแปลงใน editableGroup
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

  // 🔧 FIX: คืนค่าให้ layer อ้างอิง (Zone/Block/Boundary/ฯลฯ) กิน click ได้ตามปกติ
  // เมื่อไม่มีโหมดวาด/แก้ไข/แบ่ง/รวมทำงานอยู่แล้ว (ดู setReferenceLayersInteractive ใน layers.js)
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(true);
  }
}

/**
 * Handle feature creation
 */
map.on(L.Draw.Event.CREATED, (e) => {
  // Handle split mode
  if (splitMode && selectedForSplit && e.layerType === 'polyline') {
    const line = e.layer;
    performSplit(selectedForSplit, line);
    splitMode = false;
    selectedForSplit = null;
    activeEdit = null; // 🔧 FIX: วาดเส้นตัดเสร็จแล้ว เคลียร์ reference ที่เก็บไว้ให้ resetAllModes()
    return;
  }
  
  const layer = e.layer;
  activeEdit = null; // 🔧 FIX: วาดแปลงเสร็จแล้ว (Leaflet.Draw ปิดโหมดของตัวเองอัตโนมัติ) เคลียร์ reference ด้วย
  
  // Initialize feature properties
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
  
  // Calculate area if polygon
  if (layer instanceof L.Polygon) {
  const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
  layer.feature.properties.area = calculateThaiArea(area);
}
  
  // Prompt for properties
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
  
  // Update properties
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
  
  // Add to layers
  editableGroup.addLayer(layer);
  if (parcelLayer) {
    parcelLayer.addLayer(layer);
  }
  
  // Bind popup
  layer.bindPopup(buildPropsTable(layer.feature.properties));
  layer.openPopup();
  layer.defaultColor = STYLES.parcel.color;
  
  // Add click highlight for new feature
  layer.on('click', function(e) {
    if (activeEdit) return;
    
    // Clear other highlights
    parcelLayer.eachLayer(l => {
      if (l !== layer && l.setStyle) {
        l.setStyle({
          color: l.defaultColor || STYLES.parcel.color,
          weight: 1.4,
          fillOpacity: 0
        });
      }
    });
    
    // Highlight clicked feature
    if (layer.setStyle) {
      layer.setStyle({
        color: '#ff6b6b',
        weight: 2.5,
        fillOpacity: 0.15,
        fillColor: '#ff6b6b'
      });
    }
  });
  
  // Reset on popup close
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

  // 🔧 FIX: วาดแปลงเสร็จแล้ว (leaflet.draw ปิดโหมดวาดของตัวเองอัตโนมัติ) คืนค่าให้
  // layer อื่นกิน click ได้ตามปกติ
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(true);
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
      
      // Recalculate area if polygon
      if (layer instanceof L.Polygon) {
        const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
        layer.feature.properties.area = `${(area / 1600).toFixed(2)} ไร่`;
      }
      
      // Update popup
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
    // Remove from parcel layer
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
  // 🔧 FIX: ปิดการกิน click ของ layer อื่น (เพื่อดูเทียบ) โดยไม่ต้องติ๊กปิดออกจากแผนที่
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(false);
  }
  // 🔧 FIX (กด "หยุด"/Reset แล้วโหมดวาดยังค้าง): เก็บ instance ไว้ที่ activeEdit
  // เหมือนกับโหมดอื่นๆ ให้ resetAllModes() สั่ง .disable() ปิดโหมดวาดได้จริง
  // (เดิมสร้างลอยๆ ไม่ได้เก็บไว้ที่ไหน resetAllModes() เลยหาตัวสั่งปิดไม่เจอ)
  activeEdit = new L.Draw.Polygon(map, drawControl.options.draw.polygon);
  activeEdit.enable();
  console.log("🟢 Draw mode activated");
  alert("โหมดวาดแปลง\nคลิกบนแผนที่เพื่อวาดรูปหลายเหลี่ยม");
};

/**
 * Button: Edit feature properties
 */
$("btnEdit").onclick = () => {
  // ล้างโหมดอื่นที่อาจค้างอยู่ก่อน (วาด/แบ่ง/รวม) + handler แก้ไขข้อมูลของรอบก่อน
  resetAllModes();
  // 🔧 FIX: ปิดการกิน click ของ layer อื่น (เพื่อดูเทียบ) โดยไม่ต้องติ๊กปิดออกจากแผนที่
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(false);
  }

  alert("โหมดแก้ไขข้อมูล\nคลิกที่แปลงเพื่อแก้ไขข้อมูล");
  
  // Add ONE-TIME click handler to each layer
  editableGroup.eachLayer(layer => {
    if (!layer.feature) return;
    
    const clickHandler = function(e) {
      L.DomEvent.stopPropagation(e);

      // 🔧 FIX (คลิกผิดแปลงแล้วต้องไล่กด Cancel ทีละช่องจนครบ): เดิมถ้าคลิกผิดแปลง
      // ต้องกด Cancel ใน prompt "zone" ก่อนถึงจะยกเลิกได้ (เพราะ prompt() บล็อกทั้ง
      // หน้าเว็บ กดปุ่ม "หยุด" ระหว่างนั้นไม่ได้เลย) เพิ่มกล่องยืนยันแปลงไว้ตัวแรกสุด
      // เพื่อให้กด Cancel เพียงครั้งเดียวก็ออกจากโหมดแก้ไขของแปลงนี้ได้ทันที
      const props = layer.feature.properties;
      const confirmEdit = confirm(
        `แก้ไขข้อมูลแปลง: ${props.parcel_code || "(ไม่มีรหัส)"}\n\n` +
        `ใช่แปลงที่ต้องการหรือไม่?\n` +
        `(กด OK = ใช่ แก้ไขต่อ, Cancel = ไม่ใช่ คลิกแปลงใหม่)`
      );
      if (!confirmEdit) {
        layer.setStyle({
          color: layer.defaultColor || STYLES.parcel.color,
          weight: 1.4
        });
        // ผูก handler ของแปลงนี้กลับคืน เผื่อผู้ใช้ต้องการคลิกแปลงนี้ใหม่อีกครั้ง
        editModeHandlers.push({ layer: layer, handler: clickHandler });
        layer.once('click', clickHandler);
        return;
      }

      // Highlight
      layer.setStyle({ color: 'blue', weight: 3 });
      styledLayers.add(layer);

      // Prompt for each field
      const zone = prompt("zone:", props.zone || "");
      if (zone === null) {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4 
        });
        clearEditModeHandlers();
        return;
      }
      
      const block = prompt("block:", props.block || "");
      if (block === null) {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4 
        });
        clearEditModeHandlers();
        return;
      }
      
      const lot = prompt("lot:", props.lot || "");
      if (lot === null) {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4 
        });
        clearEditModeHandlers();
        return;
      }
      
      const parcelCode = prompt("parcel_code:", props.parcel_code || "");
      if (parcelCode === null) {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4 
        });
        clearEditModeHandlers();
        return;
      }
      
      const survey = prompt("survey:", props.survey || "-");
      const landNo = prompt("land_no:", props.land_no || "-");
      const mapsheet = prompt("Mapsheet:", props.Mapsheet || "-");
      const landType = prompt("land_type:", props.land_type || "-");
      const scale = prompt("Scale:", props.Scale || "-");
      
      // Update properties
      // Note: We don't update these fields:
      // - area (ไร่ งาน วา) = keep original calculated value
      // - created_at = keep original creation time
      // - updated_at = not needed, makes data messy
      layer.feature.properties.zone = zone;
      layer.feature.properties.block = block;
      layer.feature.properties.lot = lot;
      layer.feature.properties.parcel_code = parcelCode;
      layer.feature.properties.survey = survey;
      layer.feature.properties.land_no = landNo;
      layer.feature.properties.Mapsheet = mapsheet;
      layer.feature.properties.land_type = landType;
      layer.feature.properties.Scale = scale;
      
      // Update popup
      layer.setPopupContent(buildPropsTable(layer.feature.properties));
      layer.openPopup();
      
      // Reset style
      setTimeout(() => {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4 
        });
      }, 500);
      
      alert("✅ แก้ไขข้อมูลแล้ว\nอย่าลืมกด 💾 บันทึก");
      console.log("✅ Properties updated:", parcelCode);
      
      // Remove all handlers after edit
      clearEditModeHandlers();
    };
    
    // Store handler reference
    editModeHandlers.push({ layer: layer, handler: clickHandler });
    layer.once('click', clickHandler); // Use 'once' for one-time only
  });
  
  console.log("✏️ Edit data mode activated (one-time)");
};

/**
 * Button: Stop edit mode
 */
$("btnStop").onclick = () => {
  resetAllModes();
  console.log("⛔ All modes stopped");
  // 🔧 FIX (ค้าง/ไม่คืนค่า): เอา alert() ออกจากปุ่มนี้ เพราะ alert() เป็นคำสั่ง
  // "บล็อก" การทำงานทั้งหมดจนกว่าจะกด OK — เวลาที่เห็นใน console ว่า handler ใช้เวลา
  // เป็นวินาที ส่วนใหญ่คือเวลาที่รอผู้ใช้กด OK ไม่ใช่โค้ดทำงานช้า และทำให้รู้สึกเหมือน
  // ปุ่ม "หยุด" ไม่ตอบสนอง ทั้งที่จริงๆ รีเซ็ตเสร็จตั้งแต่ก่อนเรียก alert() แล้ว
  // ปุ่มนี้ควรเร็วและไม่ต้องกดอะไรเพิ่ม เพราะมีไว้ให้กู้สถานะตอนติดขัด
};

// Selected parcel for split
let selectedForSplit = null;

/**
 * Button: Split parcel
 */
$("btnSplit").onclick = () => {
  if (!window.turf) {
    alert("ไม่สามารถใช้งานฟังก์ชันนี้ได้\nต้องการ Turf.js library");
    return;
  }
  
  // Force reset everything first (โหมดอื่นด้วย ไม่ใช่แค่ split)
  resetAllModes();
  // 🔧 FIX: ปิดการกิน click ของ layer อื่น (เพื่อดูเทียบ) โดยไม่ต้องติ๊กปิดออกจากแผนที่
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(false);
  }
  
  // Now start split mode
  splitMode = true;
  
  alert("โหมดแบ่งแปลง\nคลิกเลือกแปลงที่ต้องการแบ่ง");
  console.log("✂️ Split mode: waiting for parcel selection");
  
  // Click to select parcel
  // 🔧 FIX: เดิมเช็คแค่กรอบสี่เหลี่ยมล้อมรอบ เปลี่ยนมาใช้ findParcelAt() ที่เช็ครูปทรงจริงก่อน
  // (กันเลือกผิดแปลงตอนแปลงข้างเคียงอยู่ชิดกัน) แล้วค่อย fallback ระยะใกล้สุดเหมือนเดิม
  const clickHandler = (e) => {
    const closestLayer = findParcelAt(e.latlng, editableGroup);
    
    if (closestLayer) {
      selectedForSplit = closestLayer;
      closestLayer.setStyle({ color: 'orange', weight: 3 });
      styledLayers.add(closestLayer);
      
      console.log("✅ Parcel selected, draw line to split");
      alert("เลือกแปลงแล้ว ✓\nวาดเส้นตัดผ่านแปลง");
      
      // Enable line drawing
      // 🔧 FIX (กด "หยุด"/Reset แล้วโหมดวาดเส้นยังค้าง): เดิมสร้าง L.Draw.Polyline
      // ลอยๆ ไม่ได้เก็บ reference ไว้ที่ activeEdit ทำให้ resetAllModes() หาตัวสั่ง
      // .disable() ไม่เจอ (activeEdit เป็น null อยู่ตลอด) โหมดวาดเส้นเลยยังทำงาน
      // อยู่เบื้องหลังแม้สีแปลงจะรีเซ็ตกลับปกติแล้วก็ตาม ตอนนี้เก็บ instance ไว้ที่
      // activeEdit ให้ resetAllModes() สั่งปิดได้จริง
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
  
  // Reset (โหมดอื่นด้วย ไม่ใช่แค่ merge)
  resetAllModes();
  // 🔧 FIX: ปิดการกิน click ของ layer อื่น (เพื่อดูเทียบ) โดยไม่ต้องติ๊กปิดออกจากแผนที่
  if (typeof setReferenceLayersInteractive === 'function') {
    setReferenceLayersInteractive(false);
  }
  
  alert("โหมดรวมแปลง\nคลิกเลือกแปลง 2 แปลงขึ้นไป\nแล้วกดปุ่ม 'รวมแปลง' อีกครั้ง");
  console.log("🔗 Merge mode: select parcels");
  
  // Click to select
  // 🔧 FIX: เดิมเช็คแค่กรอบสี่เหลี่ยมล้อมรอบ และเลือก "ตัวแรกที่เจอ" ตามลำดับ loop เท่านั้น
  // (ไม่ได้เทียบระยะเลย) ทำให้แปลงติดกันเลือกผิดตัวได้ง่าย เปลี่ยนมาใช้ findParcelAt()
  const mergeClickHandler = (e) => {
    const layer = findParcelAt(e.latlng, editableGroup);
    if (!layer) return;

    if (selectedForMerge.includes(layer)) {
      // Deselect
      layer.setStyle({ 
        color: layer.defaultColor || STYLES.parcel.color, 
        weight: 1.4 
      });
      styledLayers.delete(layer);
      selectedForMerge = selectedForMerge.filter(l => l !== layer);
      console.log(`❌ Deselected. Total: ${selectedForMerge.length}`);
    } else {
      // Select
      layer.setStyle({ color: 'blue', weight: 3 });
      styledLayers.add(layer);
      selectedForMerge.push(layer);
      console.log(`✅ Selected. Total: ${selectedForMerge.length}`);
    }

    // Auto merge if have 2+
    if (selectedForMerge.length >= 2) {
      const confirm = window.confirm(`เลือกแล้ว ${selectedForMerge.length} แปลง\nรวมเลยไหม?`);
      if (confirm) {
        setMapClickHandler(null);
        performMerge();
      }
    }
  };
  
  setMapClickHandler(mergeClickHandler);
};

/**
 * Perform split operation - อัปเดตให้ใช้ calculateThaiArea()
 */
function performSplit(polygon, line) {
  console.log("🔄 Starting split operation...");

  try {
    const poly = polygon.toGeoJSON();
    const lineGeo = line.toGeoJSON();

    // Buffer line นิดหน่อยเพื่อตัดให้ขาด
    console.log("📏 Buffering line...");
    const buffered = turf.buffer(lineGeo, 0.0005, { units: 'kilometers' });

    // แบ่งแปลง
    console.log("✂️ Splitting polygon...");
    const split = turf.difference(poly, buffered);

    if (!split || split.geometry.type === 'GeometryCollection') {
      alert("ไม่สามารถแบ่งแปลงได้\nลองวาดเส้นตัดให้ทะลุขอบทั้งสองข้าง");
      return;
    }

    // ลบแปลงเดิม
    if (editableGroup.hasLayer(polygon)) editableGroup.removeLayer(polygon);
    if (parcelLayer && parcelLayer.hasLayer(polygon)) parcelLayer.removeLayer(polygon);

    // แปลงผลลัพธ์เป็น array ของ coordinates (รองรับทั้ง Polygon และ MultiPolygon)
    const parts = split.geometry.type === 'MultiPolygon'
      ? split.geometry.coordinates
      : [split.geometry.coordinates];

    console.log(`📦 สร้างแปลงใหม่ ${parts.length} แปลง...`);

    parts.forEach((coords, i) => {
      // แปลง coordinates เป็น LatLngs สำหรับ Leaflet
      const latlngs = coords[0].map(coord => L.latLng(coord[1], coord[0]));

      // คำนวณพื้นที่ใหม่ด้วยฟังก์ชันไทย
      const areaSqM = L.GeometryUtil.geodesicArea(latlngs);
      const thaiArea = calculateThaiArea(areaSqM);

      // สร้าง polygon ใหม่
      const newPoly = L.polygon(latlngs, {
        color: STYLES.parcel.color,
        weight: 2,
        fillOpacity: 0.2
      });

      // ตั้ง properties
      newPoly.feature = {
        type: "Feature",
        properties: {
          ...polygon.feature.properties, // คัดลอกจากแปลงเดิม
          parcel_code: `${polygon.feature.properties.parcel_code}_ส่วน${i + 1}`,
          area: thaiArea, // ใช้ฟังก์ชันไทย
          split_at: new Date().toISOString()
        }
      };

      // เพิ่มลงแผนที่
      editableGroup.addLayer(newPoly);
      if (parcelLayer) parcelLayer.addLayer(newPoly);

      // Bind popup และตั้งค่าเริ่มต้น
      newPoly.bindPopup(buildPropsTable(newPoly.feature.properties));
      newPoly.defaultColor = STYLES.parcel.color;

      // เพิ่ม event คลิกไฮไลต์ (เหมือนแปลงอื่น ๆ)
      newPoly.on('click', function(e) {
        if (activeEdit) return;
        // ... (คัดลอกโค้ดไฮไลต์จากตอนสร้างใหม่มาใส่ที่นี่ถ้าต้องการ)
      });
    });

    // รีเซ็ตโหมด
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
    // 🔧 FIX: จบโหมดแบ่งแปลง (สำเร็จหรือ error) คืนค่าให้ layer อื่นกิน click ได้ตามปกติ
    if (typeof setReferenceLayersInteractive === 'function') {
      setReferenceLayersInteractive(true);
    }
  }
}

/**
 * Perform merge operation - รองรับช่องว่างเล็กน้อยระหว่างแปลง
 * ใช้เทคนิค buffer-merge-unbuffer เพื่อปิดช่องว่าง
 */
function performMerge() {
  if (selectedForMerge.length < 2) {
    alert("กรุณาเลือกอย่างน้อย 2 แปลง");
    return;
  }

  try {
    console.log(`🔗 พยายามรวม ${selectedForMerge.length} แปลง`);

    // Step 1: กรองและ validate layers
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

    // Step 2: แปลงเป็น Turf Features
    const features = validLayers.map(layer => {
      const geoJSON = layer.toGeoJSON();
      return {
        type: 'Feature',
        geometry: geoJSON.geometry,
        properties: geoJSON.properties || {}
      };
    });

    // Step 3: 🔥 ใช้ buffer เพื่อปิดช่องว่างระหว่างแปลง
    console.log("🔧 ใช้ buffer เพื่อปิดช่องว่างระหว่างแปลง...");
    
    // Buffer 1 เมตร เพื่อให้แปลงซ้อนกันนิดหน่อย
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

    // Step 4: รวมแปลงทีละตัว
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

    // Step 5: 🎯 ลด buffer กลับเพื่อให้ได้ขนาดเดิม
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

    // Step 6: จัดการ MultiPolygon ถ้ายังเหลืออยู่
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

    // ถ้ายังเป็น MultiPolygon ให้เลือกส่วนที่ใหญ่ที่สุด
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

    // Step 7: แปลงกลับเป็น Leaflet Polygon
    const latlngs = merged.geometry.coordinates[0].map(coord => 
      L.latLng(coord[1], coord[0])
    );

    // Step 8: คำนวณพื้นที่
    const areaSqM = L.GeometryUtil.geodesicArea(latlngs);
    const thaiArea = calculateThaiArea(areaSqM);

    // Step 9: สร้าง layer ใหม่
    const newLayer = L.polygon(latlngs, {
      color: STYLES.parcel.color,
      weight: 2,
      fillOpacity: 0.2
    });

    // รวมข้อมูลจากแปลงแรก
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

    // Step 10: เพิ่ม layer ใหม่เข้าแผนที่
    editableGroup.addLayer(newLayer);
    if (parcelLayer) parcelLayer.addLayer(newLayer);

    // Step 11: ลบแปลงเดิมทั้งหมด
    validLayers.forEach(layer => {
      if (editableGroup.hasLayer(layer)) editableGroup.removeLayer(layer);
      if (parcelLayer && parcelLayer.hasLayer(layer)) {
        parcelLayer.removeLayer(layer);
      }
    });

    selectedForMerge = [];
    
    // Bind popup
    newLayer.bindPopup(buildPropsTable(newLayer.feature.properties));
    newLayer.openPopup();
    newLayer.defaultColor = STYLES.parcel.color;

    // แสดงผลสำเร็จ
    const successMsg = 
      `✅ รวม ${validLayers.length} แปลงสำเร็จ!\n\n` +
      `พื้นที่รวม: ${thaiArea}\n` +
      `รหัสเดิม: ${mergedParcelCodes.substring(0, 50)}${mergedParcelCodes.length > 50 ? '...' : ''}`;
    
    alert(successMsg);
    console.log("🎉 Merge สำเร็จ - ใช้เทคนิค buffer-merge-unbuffer");

  } catch (err) {
    console.error("❌ Merge ล้มเหลว:", err);
    alert("❌ ไม่สามารถรวมแปลงได้\n\n" + err.message);

    // 🔧 FIX (ประสิทธิภาพ): รีเซ็ตเฉพาะแปลงที่เลือกไว้สำหรับรวมครั้งนี้ (selectedForMerge)
    // แทนการวนทุกแปลงใน editableGroup (เดิมช้ามากถ้าข้อมูลมีเป็นพันแปลง)
    // (เดิมยังรีเซ็ต fillOpacity เป็น 0.2 ซึ่งไม่ตรงกับค่าปกติของแปลง (0) ด้วย แก้ให้ตรงกัน)
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
    // 🔧 FIX: จบโหมดรวมแปลง (สำเร็จหรือ error) คืนค่าให้ layer อื่นกิน click ได้ตามปกติ
    if (typeof setReferenceLayersInteractive === 'function') {
      setReferenceLayersInteractive(true);
    }
  }
}

/**
 * Button: Reset/Cancel all modes
 */
$("btnDelete").onclick = () => {
  resetAllModes();
  console.log("🔄 All modes reset");
  // 🔧 FIX (ค้าง/ไม่คืนค่า): เหตุผลเดียวกับปุ่ม "หยุด" — เอา alert() ที่บล็อกหน้าจอออก
};

console.log("✅ Draw module loaded");
