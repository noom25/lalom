/* ====================== SAVE & EXPORT ====================== */

/**
 * Save data to server (with fallback to download)
 */
async function saveToServer() {
  if (!parcelLayer) {
    alert("ไม่มีข้อมูลให้บันทึก");
    return;
  }
  
  const gj = parcelLayer.toGeoJSON();
  
  // Validate data
  if (!gj || !gj.features || gj.features.length === 0) {
    alert("ไม่มีข้อมูลให้บันทึก");
    return;
  }
  
  console.log(`💾 Attempting to save ${gj.features.length} features...`);
  
  // เรียก Netlify Function แทน save.php เดิม
  const saveUrl = '/api/save';
  
  console.log(`📍 Save URL: ${saveUrl}`);
  
  try {
    const res = await fetch(saveUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(gj)
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const result = await res.json();
    
    alert(result.message || "✅ บันทึกเรียบร้อย");
    console.log("✅ Saved to server successfully");
    
  } catch (err) {
    console.error("❌ FULL ERROR:", err);
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    
    alert("Save Error: " + err.message + "\nดู Console (F12) สำหรับรายละเอียด");
    
    // DISABLED FALLBACK FOR DEBUG
    // console.log("📥 Falling back to file download...");
    return; // Stop here to see error
    
    const confirm = window.confirm(
      "ไม่สามารถบันทึกไปยังเซิร์ฟเวอร์ได้\n" +
      "คุณต้องการดาวน์โหลดเป็นไฟล์แทนหรือไม่?"
    );
    
    if (confirm) {
      downloadGeoJSON();
    }
  }
}

/**
 * Download GeoJSON file
 */
function downloadGeoJSON() {
  if (!parcelLayer) {
    alert("ไม่มีข้อมูลให้ดาวน์โหลด");
    return;
  }
  
  const gj = parcelLayer.toGeoJSON();
  
  // Validate data
  if (!gj || !gj.features || gj.features.length === 0) {
    alert("ไม่มีข้อมูลให้ดาวน์โหลด");
    return;
  }
  
  try {
    const dataStr = JSON.stringify(gj, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `parcel_${new Date().toISOString().split("T")[0]}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    
    console.log("💾 Downloaded GeoJSON successfully");
    alert(`✅ บันทึกเป็นไฟล์เรียบร้อย\n${gj.features.length} features`);
    
  } catch (err) {
    console.error("❌ Download failed:", err);
    alert("เกิดข้อผิดพลาดในการดาวน์โหลด");
  }
}

/**
 * Export to different formats
 */
function exportToFormat(format) {
  if (!parcelLayer) {
    alert("ไม่มีข้อมูลให้ส่งออก");
    return;
  }
  
  const gj = parcelLayer.toGeoJSON();
  
  switch(format) {
    case 'geojson':
      downloadGeoJSON();
      break;
      
    case 'csv':
      exportToCSV(gj);
      break;
      
    case 'kml':
      alert("ฟีเจอร์นี้ยังไม่พร้อมใช้งาน");
      break;
      
    default:
      console.warn("Unknown format:", format);
  }
}

/**
 * Export to CSV format
 */
function exportToCSV(gj) {
  try {
    // Get all unique property keys
    const allProps = new Set();
    gj.features.forEach(f => {
      Object.keys(f.properties || {}).forEach(k => allProps.add(k));
    });
    
    const headers = Array.from(allProps);
    
    // Build CSV
    let csv = headers.join(",") + "\n";
    
    gj.features.forEach(f => {
      const row = headers.map(h => {
        const val = f.properties[h];
        if (val === null || val === undefined) return "";
        // Escape commas and quotes
        const str = String(val).replace(/"/g, '""');
        return str.includes(",") ? `"${str}"` : str;
      });
      csv += row.join(",") + "\n";
    });
    
    // Download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `parcel_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    
    console.log("💾 Exported to CSV successfully");
    alert("✅ ส่งออกเป็น CSV เรียบร้อย");
    
  } catch (err) {
    console.error("❌ CSV export failed:", err);
    alert("เกิดข้อผิดพลาดในการส่งออก CSV");
  }
}

/**
 * Get statistics
 */
function getStatistics() {
  if (!parcelLayer) {
    alert("ไม่มีข้อมูล");
    return;
  }
  
  const gj = parcelLayer.toGeoJSON();
  const count = gj.features.length;
  
  // Count by zone
  const zones = {};
  gj.features.forEach(f => {
    const zone = f.properties?.zone || "ไม่ระบุ";
    zones[zone] = (zones[zone] || 0) + 1;
  });
  
  let stats = `📊 สถิติข้อมูล\n\n`;
  stats += `จำนวนแปลงทั้งหมด: ${count}\n\n`;
  stats += `จำนวนแปลงแยกตามโซน:\n`;
  
  Object.entries(zones)
    .sort((a, b) => b[1] - a[1])
    .forEach(([zone, count]) => {
      stats += `  ${zone}: ${count}\n`;
    });
  
  alert(stats);
  console.log("📊 Statistics:", { total: count, zones });
}

/**
 * Export all layers to GeoJSON
 */
function exportAllLayers() {
  // Get current layer selection
  const layerName = $("layerSelect").value;
  
  let features = [];
  
  if (layerName === "__all__") {
    // Export all editable features (parcel layer)
    if (parcelLayer) {
      const gj = parcelLayer.toGeoJSON();
      features = gj.features;
    }
  } else {
    // Export selected layer only
    if (parcelLayer) {
      parcelLayer.eachLayer(layer => {
        if (layer.feature && layer.feature.properties) {
          const props = layer.feature.properties;
          // Check if matches selected layer
          if (props.layer_name === layerName || 
              props.Layer === layerName ||
              layerName === "Parcel") {
            features.push(layer.toGeoJSON());
          }
        }
      });
    }
  }
  
  if (features.length === 0) {
    alert("ไม่มีข้อมูลให้ Export");
    return;
  }
  
  // Create GeoJSON
  const geojson = {
    type: "FeatureCollection",
    features: features
  };
  
  // Download
  const json = JSON.stringify(geojson, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const filename = layerName === "__all__" 
    ? `all_layers_${new Date().toISOString().slice(0,10)}.geojson`
    : `${layerName}_${new Date().toISOString().slice(0,10)}.geojson`;
  
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
  
  console.log(`✅ Exported ${features.length} features to ${filename}`);
  alert(`✅ Export สำเร็จ\n${features.length} แปลง → ${filename}`);
}

/**
 * Manage imported layers
 */
$("btnManageLayers").onclick = () => {
  if (!window.importedLayers || window.importedLayers.length === 0) {
    alert("ไม่มี Imported Layer");
    return;
  }
  
  let msg = "📂 Imported Layers:\n\n";
  window.importedLayers.forEach((item, idx) => {
    const status = map.hasLayer(item.layer) ? "✅ เปิด" : "❌ ปิด";
    msg += `${idx + 1}. ${item.name}\n   ${status}\n\n`;
  });
  
  msg += "\nเลือกการทำงาน:\n";
  msg += "1-9 = เปิด/ปิด layer\n";
  msg += "D1-D9 = ลบ layer\n";
  msg += "A = ลบทั้งหมด";
  
  const input = prompt(msg);
  if (!input) return;
  
  const cmd = input.toUpperCase();
  
  // Delete all
  if (cmd === 'A') {
    if (confirm("ลบ Imported Layers ทั้งหมด?")) {
      window.importedLayers.forEach(item => {
        map.removeLayer(item.layer);
      });
      window.importedLayers = [];
      alert("✅ ลบทั้งหมดแล้ว");
    }
    return;
  }
  
  // Delete specific
  if (cmd.startsWith('D')) {
    const idx = parseInt(cmd.substring(1)) - 1;
    if (idx >= 0 && idx < window.importedLayers.length) {
      const item = window.importedLayers[idx];
      map.removeLayer(item.layer);
      window.importedLayers.splice(idx, 1);
      alert(`✅ ลบ ${item.name} แล้ว`);
    }
    return;
  }
  
  // Toggle on/off
  const idx = parseInt(cmd) - 1;
  if (idx >= 0 && idx < window.importedLayers.length) {
    const item = window.importedLayers[idx];
    if (map.hasLayer(item.layer)) {
      map.removeLayer(item.layer);
      alert(`❌ ปิด ${item.name}`);
    } else {
      item.layer.addTo(map);
      alert(`✅ เปิด ${item.name}`);
    }
  }
};

/**
 * Import GeoJSON file
 */
$("btnImport").onclick = () => {
  $("importFile").click();
};

$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    let data = JSON.parse(text);
    
    // Check for nested structure (LTAX format)
    if (data.LocationGeospatial) {
      data = data.LocationGeospatial;
    }
    
    if (!data.type || data.type !== 'FeatureCollection') {
      alert("ไฟล์ไม่ใช่ GeoJSON FeatureCollection");
      return;
    }
    
    if (!data.features || data.features.length === 0) {
      alert("ไม่มีข้อมูลในไฟล์");
      return;
    }
    
    // Create new layer for imported data
    const importedLayer = L.geoJSON(data, {
      style: {
        color: '#ff9800',  // Orange color for imported layer
        weight: 2,
        fillOpacity: 0.1
      },
      onEachFeature: function(feature, layer) {
        // Bind popup
        if (feature.properties) {
          layer.bindPopup(buildPropsTable(feature.properties));
        }
      }
    });
    
    // Add to map
    importedLayer.addTo(map);
    
    // Store reference for layer control
    if (!window.importedLayers) {
      window.importedLayers = [];
    }
    
    const layerName = `Import: ${file.name} (${data.features.length} แปลง)`;
    window.importedLayers.push({
      name: layerName,
      layer: importedLayer
    });
    
    // Zoom to imported layer
    try {
      map.fitBounds(importedLayer.getBounds());
    } catch (err) {
      console.warn("Cannot fit bounds:", err);
    }
    
    alert(`✅ Import สำเร็จ\n${data.features.length} แปลง\n\nเลเยอร์ใหม่: ${layerName}\n(สีส้ม)`);
    console.log(`✅ Created new layer: ${layerName}`);
    
    // Reset file input
    e.target.value = '';
    
  } catch (err) {
    console.error("Import error:", err);
    alert("❌ Import ไม่สำเร็จ\n" + err.message);
  }
};

/**
 * Button: Export
 */
$("btnExport").onclick = exportAllLayers;

/**
 * Button: Save
 */
$("btnSave").onclick = saveToServer;

// Add keyboard shortcut: Ctrl+S
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveToServer();
  }
});

console.log("✅ Storage module loaded");
