/* ====================== LAYER MANAGEMENT ====================== */

// Global layer variables
let parcelLayer, blockLayer, zoneLayer, boundaryLayer, buildingLayer, spkLayer;
let boundaryPointLayer, แปลงชุมชนLayer, แปลงเกษตรLayer;
let parcelGeoJSON;

/**
 * Build HTML table for popup content
 */
function buildPropsTable(props = {}) {
  if (!props || Object.keys(props).length === 0) {
    return '<div class="popup-content"><table><tr><td>ไม่มีข้อมูล</td></tr></table></div>';
  }
  
  const keys = Object.keys(props).filter(k => k !== 'geometry');
  let html = '<div class="popup-content" style="max-height:350px; overflow-y:auto;"><table>';
  
  keys.forEach((k, idx) => {
    const value = props[k] ?? "-";
    const display = idx < 8 ? '' : ' style="display:none;" class="extra-field"';
    html += `<tr${display}><td><b>${k}</b></td><td>${value}</td></tr>`;
  });
  
  html += '</table>';
  
  if (keys.length > 9) {
    html += `<button onclick="toggleExtraFields(this)" style="margin-top:5px;padding:3px 8px;font-size:11px;cursor:pointer;background:#2196F3;color:white;border:none;border-radius:3px;">▼ แสดงเพิ่ม (${keys.length - 8})</button>`;
  }
  
  html += '</div>';
  return html;
}

// Toggle extra fields
window.toggleExtraFields = function(btn) {
  const popup = btn.closest('.popup-content');
  const extras = popup.querySelectorAll('.extra-field');
  const isHidden = extras[0].style.display === 'none';
  
  extras.forEach(row => row.style.display = isHidden ? 'table-row' : 'none');
  btn.innerHTML = isHidden ? '▲ ซ่อน' : `▼ แสดงเพิ่ม (${extras.length})`;
};

/**
 * Load vector layer (polygons/lines)
 */
async function loadVector(url, style, popupBuilder) {
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
async function loadPoints(url, circleStyle) {
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
  blockLayer = await loadVector(DATA_BLOCK, STYLES.block);
  if (blockLayer) { 
    overlayMaps["Block"] = blockLayer; 
    layersCtl.addOverlay(blockLayer, "Block"); 
  }
  
  zoneLayer = await loadVector(DATA_ZONE, STYLES.zone);
  if (zoneLayer) { 
    overlayMaps["Zone"] = zoneLayer; 
    layersCtl.addOverlay(zoneLayer, "Zone"); 
  }
  
  boundaryLayer = await loadVector(DATA_BOUNDARY, STYLES.boundary);
  if (boundaryLayer) { 
    overlayMaps["Boundary"] = boundaryLayer; 
    layersCtl.addOverlay(boundaryLayer, "Boundary"); 
  }
  
  buildingLayer = await loadVector(DATA_BUILDING, STYLES.building);
  if (buildingLayer) { 
    overlayMaps["Building"] = buildingLayer; 
    layersCtl.addOverlay(buildingLayer, "Building"); 
  }
  
  spkLayer = await loadVector(DATA_SPK, STYLES.spk);
  if (spkLayer) { 
    overlayMaps["SPK"] = spkLayer; 
    layersCtl.addOverlay(spkLayer, "SPK"); 
  }
  
  แปลงชุมชนLayer = await loadVector(DATA_แปลงชุมชน, STYLES.community);
  if (แปลงชุมชนLayer) { 
    overlayMaps["แปลงชุมชน"] = แปลงชุมชนLayer; 
    layersCtl.addOverlay(แปลงชุมชนLayer, "แปลงชุมชน"); 
  }
  
  แปลงเกษตรLayer = await loadVector(DATA_แปลงเกษตร, STYLES.agriculture);
  if (แปลงเกษตรLayer) { 
    overlayMaps["แปลงเกษตร"] = แปลงเกษตรLayer; 
    layersCtl.addOverlay(แปลงเกษตรLayer, "แปลงเกษตร"); 
  }
  
  boundaryPointLayer = await loadPoints(DATA_BPOINT, STYLES.boundaryPoint);
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
