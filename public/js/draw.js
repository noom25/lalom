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
    return;
  }
  
  const layer = e.layer;
  
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
  new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
  console.log("🟢 Draw mode activated");
  alert("โหมดวาดแปลง\nคลิกบนแผนที่เพื่อวาดรูปหลายเหลี่ยม");
};

/**
 * Button: Edit feature properties
 */
$("btnEdit").onclick = () => {
  alert("โหมดแก้ไขข้อมูล\nคลิกที่แปลงเพื่อแก้ไขข้อมูล");
  
  // Add ONE-TIME click handler to each layer
  const handlers = [];
  
  editableGroup.eachLayer(layer => {
    if (!layer.feature) return;
    
    const clickHandler = function(e) {
      L.DomEvent.stopPropagation(e);
      
      // Highlight
      layer.setStyle({ color: 'blue', weight: 3 });
      
      // Get current properties
      const props = layer.feature.properties;
      
      // Prompt for each field
      const zone = prompt("zone:", props.zone || "");
      if (zone === null) {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4 
        });
        removeAllHandlers();
        return;
      }
      
      const block = prompt("block:", props.block || "");
      if (block === null) {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4 
        });
        removeAllHandlers();
        return;
      }
      
      const lot = prompt("lot:", props.lot || "");
      if (lot === null) {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4 
        });
        removeAllHandlers();
        return;
      }
      
      const parcelCode = prompt("parcel_code:", props.parcel_code || "");
      if (parcelCode === null) {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4 
        });
        removeAllHandlers();
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
      removeAllHandlers();
    };
    
    // Store handler reference
    handlers.push({ layer: layer, handler: clickHandler });
    layer.once('click', clickHandler); // Use 'once' for one-time only
  });
  
  // Function to remove all handlers
  function removeAllHandlers() {
    handlers.forEach(h => {
      h.layer.off('click', h.handler);
    });
  }
  
  console.log("✏️ Edit data mode activated (one-time)");
};

/**
 * Button: Stop edit mode
 */
$("btnStop").onclick = () => {
  if (activeEdit) {
    activeEdit.disable();
    activeEdit = null;
  }
  
  // Reset split mode
  splitMode = false;
  selectedForSplit = null;
  map.off('click');
  
  // Reset colors
  editableGroup.eachLayer(layer => {
    if (layer.setStyle) {
      layer.setStyle({ 
        color: layer.defaultColor || STYLES.parcel.color, 
        weight: 1.4 
      });
    }
  });
  
  selectedForMerge = [];
  
  console.log("⛔ All modes stopped");
  alert("หยุดโหมดแก้ไข");
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
  
  // Force reset everything first
  map.off('click');
  splitMode = false;
  selectedForSplit = null;
  
  // Clear any stuck styles
  editableGroup.eachLayer(layer => {
    if (layer.setStyle) {
      layer.setStyle({ 
        color: layer.defaultColor || STYLES.parcel.color, 
        weight: 1.4 
      });
    }
  });
  
  // Now start split mode
  splitMode = true;
  
  alert("โหมดแบ่งแปลง\nคลิกเลือกแปลงที่ต้องการแบ่ง");
  console.log("✂️ Split mode: waiting for parcel selection");
  
  // Click to select parcel
  const clickHandler = (e) => {
    let found = false;
    let closestLayer = null;
    let minDist = Infinity;
    
    // Find closest parcel
    editableGroup.eachLayer(layer => {
      if (layer.getBounds) {
        const bounds = layer.getBounds();
        const center = bounds.getCenter();
        const dist = e.latlng.distanceTo(center);
        
        // Check if click is inside or near (within 50m)
        if (bounds.contains(e.latlng) || dist < 50) {
          if (dist < minDist) {
            minDist = dist;
            closestLayer = layer;
            found = true;
          }
        }
      }
    });
    
    if (found && closestLayer) {
      selectedForSplit = closestLayer;
      closestLayer.setStyle({ color: 'orange', weight: 3 });
      
      console.log("✅ Parcel selected, draw line to split");
      alert("เลือกแปลงแล้ว ✓\nวาดเส้นตัดผ่านแปลง");
      
      // Enable line drawing
      new L.Draw.Polyline(map, {
        shapeOptions: {
          color: 'red',
          weight: 3,
          dashArray: '10, 10'
        }
      }).enable();
      
      map.off('click', clickHandler);
    } else {
      console.log("⚠️ No parcel found. Click closer to parcel.");
      alert("ไม่พบแปลง\nคลิกใกล้ๆ แปลงมากขึ้น");
    }
  };
  
  map.on('click', clickHandler);
};


/**
 * Button: Merge parcels
 */
$("btnMerge").onclick = () => {
  if (!window.turf) {
    alert("ไม่สามารถใช้งานฟังก์ชันนี้ได้\nต้องการ Turf.js library");
    return;
  }
  
  // Reset
  selectedForMerge = [];
  map.off('click');
  
  // Clear styles
  editableGroup.eachLayer(layer => {
    if (layer.setStyle) {
      layer.setStyle({ 
        color: layer.defaultColor || STYLES.parcel.color, 
        weight: 1.4 
      });
    }
  });
  
  alert("โหมดรวมแปลง\nคลิกเลือกแปลง 2 แปลงขึ้นไป\nแล้วกดปุ่ม 'รวมแปลง' อีกครั้ง");
  console.log("🔗 Merge mode: select parcels");
  
  // Click to select
  const mergeClickHandler = (e) => {
    let found = false;
    editableGroup.eachLayer(layer => {
      if (!found && layer.getBounds && layer.getBounds().contains(e.latlng)) {
        found = true;
        
        if (selectedForMerge.includes(layer)) {
          // Deselect
          layer.setStyle({ 
            color: layer.defaultColor || STYLES.parcel.color, 
            weight: 1.4 
          });
          selectedForMerge = selectedForMerge.filter(l => l !== layer);
          console.log(`❌ Deselected. Total: ${selectedForMerge.length}`);
        } else {
          // Select
          layer.setStyle({ color: 'blue', weight: 3 });
          selectedForMerge.push(layer);
          console.log(`✅ Selected. Total: ${selectedForMerge.length}`);
        }
        
        // Auto merge if have 2+
        if (selectedForMerge.length >= 2) {
          const confirm = window.confirm(`เลือกแล้ว ${selectedForMerge.length} แปลง\nรวมเลยไหม?`);
          if (confirm) {
            map.off('click', mergeClickHandler);
            performMerge();
          }
        }
      }
    });
  };
  
  map.on('click', mergeClickHandler);
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
    const buffered = turf.buffer(lineGeo, 0.0001, { units: 'kilometers' });

    // แบ่งแปลง
    console.log("✂️ Splitting polygon...");
    const split = turf.difference(poly, buffered);

    if (!split || split.geometry.type === 'GeometryCollection') {
      alert("ไม่สามารถแบ่งแปลงได้\nลองวาดเส้นตัดให้ทะลุขอบทั้งสองข้าง");
      return;
    }

    // ลบแปลงเดิม
    editableGroup.removeLayer(polygon);
    if (parcelLayer) parcelLayer.removeLayer(polygon);

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
      editableGroup.removeLayer(layer);
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

    // รีเซ็ตสถานะและสี
    if (editableGroup) {
      editableGroup.eachLayer(layer => {
        if (layer.setStyle && typeof layer.setStyle === 'function') {
          layer.setStyle({
            color: layer.defaultColor || STYLES.parcel.color,
            weight: 1.4,
            fillOpacity: 0.2
          });
        }
      });
    }
    
    selectedForMerge = [];
  }
}

/**
 * Button: Reset/Cancel all modes
 */
$("btnDelete").onclick = () => {
  // Stop all edit modes
  if (activeEdit) {
    activeEdit.disable();
    activeEdit = null;
  }
  
  // Reset split mode
  splitMode = false;
  selectedForSplit = null;
  
  // Reset merge mode
  selectedForMerge = [];
  
  // Clear all event handlers
  map.off('click');
  
  // Reset all layer styles
  editableGroup.eachLayer(layer => {
    if (layer.setStyle) {
      layer.setStyle({ 
        color: layer.defaultColor || STYLES.parcel.color, 
        weight: 1.4,
        fillOpacity: 0
      });
    }
  });
  
  // Close all popups
  map.closePopup();
  
  console.log("🔄 All modes reset");
  alert("ยกเลิกทุกโหมด\nพร้อมใช้งานใหม่");
};

console.log("✅ Draw module loaded");
