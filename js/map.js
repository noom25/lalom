/* ====================== MAP INITIALIZATION ====================== */

// Create map instance
const map = L.map("map", { 
  zoomControl: true,
  preferCanvas: true
}).setView(START_CENTER, START_ZOOM);

// Base Layers
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 22, 
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

const gHybrid = L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
  maxZoom: 22, 
  attribution: "© Google"
});

const gStreet = L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
  maxZoom: 22, 
  attribution: "© Google"
});

const gSatellite = L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
  maxZoom: 22, 
  attribution: "© Google"
});

// ========== เพิ่มเส้นแดงกรมที่ดิน (DLA Parcel) - ใช้ WMS ==========
// ชื่อ layer ที่ถูกต้องคือ 'dol_hd' (ตรวจสอบจาก QGIS แล้ว)

const dlaParcel = L.tileLayer.wms("http://ms.longdo.com/mapproxy/service", {
  layers: 'dol_hd',  // ✅ ชื่อ layer ที่ถูกต้อง
  format: 'image/png',
  transparent: true,
  version: '1.1.1',
  crs: L.CRS.EPSG3857,
  attribution: "กรมที่ดิน via Longdo Map",
  opacity: 0.7,
  maxZoom: 22,
  minZoom: 12
});

// Event สำหรับ debug
dlaParcel.on('tileerror', function(e) {
  console.error('❌ DLA WMS Error:', e.tile.src);
});

dlaParcel.on('tileload', function(e) {
  console.log('✅ DLA WMS (dol_hd) loaded successfully!');
});

// เพิ่มเข้าแผนที่
dlaParcel.addTo(map);
console.log('🗺️ เพิ่มเส้นแดงกรมที่ดิน (dol_hd) เรียบร้อย');

// ถ้าอยากมีขอบเขตตำบลเพิ่ม
const dlaTambon = L.tileLayer.wms("http://ms.longdo.com/mapproxy/service", {
  layers: 'dol_tambon',
  format: 'image/png',
  transparent: true,
  version: '1.1.1',
  crs: L.CRS.EPSG3857,
  attribution: "กรมที่ดิน via Longdo Map",
  opacity: 0.5,
  maxZoom: 22,
  minZoom: 12
});

// Layer Controls
const baseMaps = { 
  "OpenStreetMap": osm, 
  "Google Hybrid": gHybrid, 
  "Google Street": gStreet,
  "Google Satellite": gSatellite
};

const overlayMaps = {
  "🔴 เส้นแดงกรมที่ดิน": dlaParcel,
  
};

const layersCtl = L.control.layers(baseMaps, overlayMaps, { 
  collapsed: false,
  position: 'topright'
}).addTo(map);

// Editable Feature Group for Leaflet.draw
const editableGroup = L.featureGroup().addTo(map);

// Scale Control
L.control.scale({
  metric: true,
  imperial: false,
  position: 'bottomleft'
}).addTo(map);

// Map Click Handler (optional - for debugging)
map.on('click', function(e) {
  console.log("Map clicked at:", e.latlng);
});

console.log("🗺️ Map initialized");

