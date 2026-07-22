/* ====================== LAYER MANAGEMENT ====================== */

// Global layer variables
let parcelLayer, blockLayer, zoneLayer, boundaryLayer, buildingLayer, spkLayer;
let boundaryPointLayer, แปลงชุมชนLayer, แปลงเกษตรLayer;
let parcelGeoJSON;

/**
 * Build HTML table for popup content
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPropsTable(props = {}) {
  if (!props || Object.keys(props).length === 0) {
    return '<table class="ptbl"><tr><td>ไม่มีข้อมูล</td></tr></table>';
  }
  
  const keys = Object.keys(props).filter(k => k !== 'geometry');
  const MAIN_COUNT = 10;
  const mainKeys = keys.slice(0, MAIN_COUNT);
  const extraKeys = keys.slice(MAIN_COUNT);
  
  // ตารางหลัก (แสดงตลอด)
  let html = '<table class="ptbl">';
  mainKeys.forEach((k) => {
    const rawValue = props[k] ?? "-";
    const safeValue = escapeHtml(rawValue);
    html += `<tr><td class="ptbl-key"><b>${escapeHtml(k)}</b></td><td class="ptbl-val" title="${safeValue}">${safeValue}</td></tr>`;
  });
  html += '</table>';
  
  // ฟิลด์เพิ่มเติม: อยู่ในตารางแยก ห่อด้วย div ซ่อนไว้ก่อน
  // ให้มี scrollbar แนวตั้งเสมอ (จำกัดความสูงไว้) กัน popup ขยายยาวจนล้นจอ
  // ไม่ว่าจะมีฟิลด์เพิ่มเติมกี่รายการก็ตาม
  if (extraKeys.length > 0) {
    // ไม่ใส่ scroll แยกตรงนี้แล้ว ปล่อยให้ popup ทั้งกล่อง (.leaflet-popup-content)
    // เป็นตัวเลื่อนแทน เพื่อให้เลื่อนได้ทุก field ทั้งแถวหลักและแถวเพิ่มเติมในสโครลเดียวกัน
    let extraHtml = '<table class="ptbl">';
    extraKeys.forEach((k) => {
      const rawValue = props[k] ?? "-";
      const safeValue = escapeHtml(rawValue);
      extraHtml += `<tr><td class="ptbl-key"><b>${escapeHtml(k)}</b></td><td class="ptbl-val" title="${safeValue}">${safeValue}</td></tr>`;
    });
    extraHtml += '</table>';
    
    html += `<div class="ptbl-extra-wrap" style="display:none;">${extraHtml}</div>`;
    html += `<button onclick="toggleExtraFields(this)" class="ptbl-more">▼ แสดงเพิ่ม (${extraKeys.length})</button>`;
  }
  
  return html;
}

// Toggle extra fields container (div ที่ห่อ table ของฟิลด์เพิ่มเติม อยู่ก่อนปุ่มเสมอ)
window.toggleExtraFields = function(btn) {
  const container = btn.previousElementSibling;
  if (!container || !container.classList.contains('ptbl-extra-wrap')) return;
  
  const isHidden = container.style.display === 'none';
  const extraCount = container.querySelectorAll('tr').length;
  
  container.style.display = isHidden ? 'block' : 'none';
  btn.innerHTML = isHidden ? '▲ ซ่อนข้อมูล' : `▼ แสดงเพิ่ม (${extraCount})`;
  btn.classList.toggle('ptbl-more-active', isHidden);
};

// เพิ่ม style ของเส้นคั่นฟิลด์เพิ่มเติม + scrollbar ของกล่อง popup ทั้งกล่อง
// (ย้าย scrollbar มาไว้ที่ .leaflet-popup-content แทน เพื่อให้เลื่อนได้ทุก field
//  ทั้งแถวหลัก (1-8) และแถวเพิ่มเติม (9 ขึ้นไป) ในสโครลบาร์เดียวกัน)
(function injectExtraFieldScrollStyle() {
  if (document.getElementById('ptbl-extra-style')) return;
  const style = document.createElement('style');
  style.id = 'ptbl-extra-style';
  style.textContent = `
    .leaflet-popup-content::-webkit-scrollbar {
      width: 6px;
    }
    .leaflet-popup-content::-webkit-scrollbar-track {
      background: transparent;
    }
    .leaflet-popup-content::-webkit-scrollbar-thumb {
      background: #bbb;
      border-radius: 3px;
    }
    .leaflet-popup-content::-webkit-scrollbar-thumb:hover {
      background: #999;
    }
  `;
  document.head.appendChild(style);
})();

// บังคับ style ของ popup ทุกครั้งที่เปิด กัน scrollbar แนวนอนแบบเด็ดขาด
// ทำงาน "หลังจาก" Leaflet render เสร็จเสมอ จึงชนะ style อื่นๆ ทั้งหมด ไม่ต้องพึ่ง CSS cascade/specificity
if (typeof map !== 'undefined' && map.on) {
  map.on('popupopen', function (e) {
    const el = e.popup.getElement();
    if (!el) return;
    const content = el.querySelector('.leaflet-popup-content');
    if (content) {
      content.style.setProperty('overflow-x', 'hidden', 'important');
      content.style.setProperty('overflow-y', 'auto', 'important');
      content.style.setProperty('max-width', 'min(320px, 85vw)', 'important');
      // จำกัดความสูงของกล่อง popup ทั้งกล่อง ให้ overflow-y:auto ทำงานจริง
      // เพื่อให้เลื่อน scrollbar ได้ทุก field (ทั้งแถวหลักและแถวเพิ่มเติม) ไม่ใช่แค่จากแถวที่ 9 ลงไป
      content.style.setProperty('max-height', '300px', 'important');
      content.style.setProperty('box-sizing', 'border-box', 'important');
    }
  });
}

/**
 * Load vector layer (polygons/lines)
 */
async function loadVector(url, style, popupBuilder, layerLabel = "เลเยอร์") {
  try {
    const res = await fetch(url, { 
      cache: "no-store",
      headers: { 'Accept': 'application/json' }
    });
    
    if (!res.ok) {
      console.warn(`⚠️ HTTP ${res.status} for ${url}`);
      return null;
    }
    
    const data = await res.json();
    
    if (!data || !data.features || data.features.length === 0) {
      console.warn(`⚠️ No features in ${url}`);
      return null;
    }
    
    const layer = L.geoJSON(data, {
      style: style,
      onEachFeature: (feat, layer) => {
        const html = popupBuilder ? popupBuilder(feat) : buildPropsTable(feat.properties);
        layer.bindPopup(html, { 
          className: "popup-content",
          maxWidth: 400,
          maxHeight: 300
        });
        
        // Store default style
        layer.defaultColor = style.color;
        layer.defaultWeight = style.weight;
        layer.defaultFillOpacity = style.fillOpacity || 0;
        
        // Add click highlight
        layer.on('click', function(e) {
          // Don't highlight if in edit mode
          if (activeEdit) return;
          
          // Highlight clicked feature
          if (layer.setStyle) {
            layer.setStyle({
              color: '#ff6b6b',
              weight: (style.weight || 1) + 1,
              fillOpacity: 0.15,
              fillColor: '#ff6b6b'
            });
          }

          // แสดงข้อมูลใน sidebar ด้านซ้าย (แบบ LandsPublic)
          if (typeof window.showParcelSidebar === 'function') {
            try {
              const center = layer.getBounds ? layer.getBounds().getCenter() : e.latlng;
              window.showParcelSidebar(feat.properties, layerLabel, center);
            } catch (err) {
              window.showParcelSidebar(feat.properties, layerLabel, e.latlng);
            }
          }
        });
        
        // Reset on popup close
        layer.on('popupclose', function() {
          setTimeout(() => {
            if (layer.setStyle && !lastHighlighted.includes(layer)) {
              layer.setStyle({
                color: layer.defaultColor,
                weight: layer.defaultWeight,
                fillOpacity: layer.defaultFillOpacity
              });
            }
          }, 100);
        });
      }
    }).addTo(map);
    
    console.log(`✅ Loaded ${url}: ${data.features.length} features`);
    return layer;
    
  } catch (e) {
    console.warn(`⚠️ Could not load ${url}:`, e.message);
    return null;
  }
}

/**
 * Load point layer (circle markers)
 */
async function loadPoints(url, circleStyle, layerLabel = "Boundary Point") {
  try {
    const res = await fetch(url, { 
      cache: "no-store",
      headers: { 'Accept': 'application/json' }
    });
    
    if (!res.ok) {
      console.warn(`⚠️ HTTP ${res.status} for ${url}`);
      return null;
    }
    
    const data = await res.json();
    
    if (!data || !data.features || data.features.length === 0) {
      console.warn(`⚠️ No features in ${url}`);
      return null;
    }
    
    const layer = L.geoJSON(data, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, circleStyle),
      onEachFeature: (feat, layer) => {
        layer.bindPopup(buildPropsTable(feat.properties), { 
          className: "popup-content",
          maxWidth: 400,
          maxHeight: 300
        });
        
        // Store default style
        layer.defaultRadius = circleStyle.radius;
        layer.defaultColor = circleStyle.color;
        
        // Add click highlight
        layer.on('click', function(e) {
          // Highlight clicked point
          if (layer.setStyle) {
            layer.setStyle({
              radius: circleStyle.radius + 2,
              color: '#ff6b6b',
              fillColor: '#ff6b6b',
              weight: circleStyle.weight + 1
            });
          }

          // แสดงข้อมูลใน sidebar ด้านซ้าย (แบบ LandsPublic)
          if (typeof window.showParcelSidebar === 'function') {
            window.showParcelSidebar(feat.properties, layerLabel, e.latlng);
          }
        });
        
        // Reset on popup close
        layer.on('popupclose', function() {
          setTimeout(() => {
            if (layer.setStyle && !lastHighlighted.includes(layer)) {
              layer.setStyle({
                radius: layer.defaultRadius,
                color: layer.defaultColor,
                fillColor: circleStyle.fillColor,
                weight: circleStyle.weight
              });
            }
          }, 100);
        });
      }
    }).addTo(map);
    
    console.log(`✅ Loaded ${url}: ${data.features.length} points`);
    return layer;
    
  } catch (e) {
    console.warn(`⚠️ Could not load ${url}:`, e.message);
    return null;
  }
}

/**
 * Handler for each parcel feature
 */
function onEachParcel(feature, layer) {
  // Bind popup
  layer.bindPopup(buildPropsTable(feature.properties), { 
    className: "popup-content",
    maxWidth: 400,
    maxHeight: 300
  });
  
  // Add to editable group for drawing/editing
  editableGroup.addLayer(layer);
  
  // Store default color for highlighting
  layer.defaultColor = STYLES.parcel.color;
  
  // Add click event for highlight
  layer.on('click', function(e) {
    // Don't highlight if in edit mode
    if (activeEdit) return;
    
    // Clear previous highlights
    parcelLayer.eachLayer(l => {
      if (l !== layer && l.setStyle) {
        l.setStyle({
          color: l.defaultColor || STYLES.parcel.color,
          weight: 1.4,
          fillOpacity: 0
        });
      }
    });
    
    // Highlight clicked parcel
    if (layer.setStyle) {
      layer.setStyle({
        color: '#ff6b6b',
        weight: 2.5,
        fillOpacity: 0.15,
        fillColor: '#ff6b6b'
      });
    }

    // แสดงข้อมูลแปลงนี้ใน sidebar ด้านซ้าย (แบบ LandsPublic)
    if (typeof window.showParcelSidebar === 'function') {
      try {
        const center = layer.getBounds().getCenter();
        window.showParcelSidebar(feature.properties, "Parcel", center);
      } catch (err) {
        window.showParcelSidebar(feature.properties, "Parcel", null);
      }
    }
  });
  
  // Reset highlight when popup closes
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
}

/**
 * Load Parcel layer (main layer)
 */
async function loadParcels() {
  try {
    console.log("Loading Parcel layer...");
    
    // 1) ลองโหลดข้อมูลที่เคยบันทึกไว้ผ่าน Netlify Function ก่อน
    //    (ข้อมูลที่วาด/แก้ไขแล้วกด "บันทึก" จะถูกเก็บไว้ที่นี่ ไม่ใช่ไฟล์ data/parcel.geojson เดิม)
    try {
      const savedRes = await fetch('/api/load', { cache: "no-store" });
      if (savedRes.ok) {
        parcelGeoJSON = await savedRes.json();
        console.log("✅ โหลดข้อมูลที่เคยบันทึกไว้ (จาก Netlify Blobs)");
      }
    } catch (e) {
      console.warn("⚠️ ยังไม่มีข้อมูลที่บันทึกไว้ใน Blobs หรือเรียก function ไม่ได้:", e.message);
    }
    
    // 2) ถ้ายังไม่เคยบันทึก (หรือ function ยังไม่ได้ deploy) ให้ใช้ไฟล์ตั้งต้นแทน
    if (!parcelGeoJSON || !parcelGeoJSON.features) {
      const res = await fetch(DATA_PARCEL, { 
        cache: "no-store",
        headers: { 'Accept': 'application/json' }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      parcelGeoJSON = await res.json();
      console.log("📄 โหลดข้อมูลตั้งต้นจาก data/parcel.geojson");
    }
    
    if (!parcelGeoJSON || !parcelGeoJSON.features) {
      throw new Error("Invalid GeoJSON format");
    }
    
    parcelLayer = L.geoJSON(parcelGeoJSON, {
      style: STYLES.parcel,
      onEachFeature: onEachParcel
    }).addTo(map);
    
    // Add to layer control
    overlayMaps["Parcel"] = parcelLayer;
    layersCtl.addOverlay(parcelLayer, "Parcel");
    
    // Fit map to parcel bounds
    try { 
      const bounds = parcelLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { maxZoom: 18 });
      }
    } catch(e) {
      console.warn("Could not fit bounds:", e.message);
    }
    
    console.log(`✅ Loaded Parcel layer: ${parcelGeoJSON.features.length} features`);
    
  } catch (e) {
    console.error("⚠️ Could not load Parcel layer:", e.message);
    alert("ไม่สามารถโหลดข้อมูล Parcel ได้\nกรุณาตรวจสอบไฟล์ data/parcel.geojson");
  }
}

/**
 * Load all layers
 */
async function loadAllLayers() {
  console.log("🔄 Loading all layers...");
  
  // Load Parcel first (main layer)
  await loadParcels();
  
  // Load other layers
  blockLayer = await loadVector(DATA_BLOCK, STYLES.block, null, "Block");
  if (blockLayer) { 
    overlayMaps["Block"] = blockLayer; 
    layersCtl.addOverlay(blockLayer, "Block"); 
  }
  
  zoneLayer = await loadVector(DATA_ZONE, STYLES.zone, null, "Zone");
  if (zoneLayer) { 
    overlayMaps["Zone"] = zoneLayer; 
    layersCtl.addOverlay(zoneLayer, "Zone"); 
  }
  
  boundaryLayer = await loadVector(DATA_BOUNDARY, STYLES.boundary, null, "Boundary");
  if (boundaryLayer) { 
    overlayMaps["Boundary"] = boundaryLayer; 
    layersCtl.addOverlay(boundaryLayer, "Boundary"); 
  }
  
  buildingLayer = await loadVector(DATA_BUILDING, STYLES.building, null, "Building");
  if (buildingLayer) { 
    overlayMaps["Building"] = buildingLayer; 
    layersCtl.addOverlay(buildingLayer, "Building"); 
  }
  
  spkLayer = await loadVector(DATA_SPK, STYLES.spk, null, "SPK");
  if (spkLayer) { 
    overlayMaps["SPK"] = spkLayer; 
    layersCtl.addOverlay(spkLayer, "SPK"); 
  }
  
  แปลงชุมชนLayer = await loadVector(DATA_แปลงชุมชน, STYLES.community, null, "แปลงชุมชน");
  if (แปลงชุมชนLayer) { 
    overlayMaps["แปลงชุมชน"] = แปลงชุมชนLayer; 
    layersCtl.addOverlay(แปลงชุมชนLayer, "แปลงชุมชน"); 
  }
  
  แปลงเกษตรLayer = await loadVector(DATA_แปลงเกษตร, STYLES.agriculture, null, "แปลงเกษตร");
  if (แปลงเกษตรLayer) { 
    overlayMaps["แปลงเกษตร"] = แปลงเกษตรLayer; 
    layersCtl.addOverlay(แปลงเกษตรLayer, "แปลงเกษตร"); 
  }
  
  boundaryPointLayer = await loadPoints(DATA_BPOINT, STYLES.boundaryPoint, "Boundary Point");
  if (boundaryPointLayer) { 
    overlayMaps["Boundary Point"] = boundaryPointLayer; 
    layersCtl.addOverlay(boundaryPointLayer, "Boundary Point"); 
  }
  
  console.log("✅ All layers loaded");
  
  // Check for URL parameters (e.g., ?parcel=24A001)
  const urlParams = new URLSearchParams(window.location.search);
  const parcelCode = urlParams.get("parcel");
  
  if (parcelCode && /^[0-9]{2}[A-Za-z][0-9]{3}(\/[0-9]{3})?$/.test(parcelCode)) {
    console.log(`🔍 URL parameter detected: parcel=${parcelCode}`);
    // Wait a bit for layers to settle
    setTimeout(() => highlightParcel(parcelCode), 500);
  }
}

console.log("✅ Layers module loaded");
