/* ====================== CONFIGURATION ====================== */

// Data File Paths
const DATA_PARCEL   = "data/parcel.geojson";
const DATA_BLOCK    = "data/block.geojson";
const DATA_ZONE     = "data/zone.geojson";
const DATA_BOUNDARY = "data/boundary.geojson";
const DATA_BUILDING = "data/building.geojson";
const DATA_SPK      = "data/spk.geojson";
const DATA_แปลงเกษตร  = "data/แปลงเกษตร.geojson";
const DATA_แปลงชุมชน = "data/แปลงชุมชน.geojson";
const DATA_BPOINT   = "data/boundarypoint.geojson";

// Map Initial Settings
const START_CENTER = [14.6005, 104.2500];
const START_ZOOM   = 15;

// Layer Styles
const STYLES = {
  parcel: { 
    color: "#17ff3e", 
    weight: 1.4, 
    fillOpacity: 0,
    opacity: 1
  },
  block: { 
    color: "#2b6cb0", 
    weight: 2, 
    fillOpacity: 0,
    opacity: 1
  },
  zone: { 
    color: "#2a08ebff", 
    weight: 2.2, 
    fillOpacity: 0,
    opacity: 1
  },
  boundary: { 
    color: "#f70808ff", 
    weight: 2.5, 
    fillOpacity: 0,
    opacity: 1
  },
  building: { 
    color: "#8b5e3c", 
    weight: 1, 
    fillColor: "#8b5e3c",
    fillOpacity: 0.25,
    opacity: 1
  },
  spk: { 
    color: "#ea580c", 
    weight: 1, 
    dashArray: "4,3", 
    fillOpacity: 0,
    opacity: 1
  },
  community: { 
    color: "#ea0ceaff", 
    weight: 1, 
    dashArray: "4,3", 
    fillOpacity: 0,
    opacity: 1
  },
  agriculture: { 
    color: "#d4ea0cff", 
    weight: 1, 
    dashArray: "4,3", 
    fillOpacity: 0,
    opacity: 1
  },
  boundaryPoint: { 
    radius: 5, 
    color: "#ec0b0bff", 
    weight: 2.5, 
    fillColor: "#ee0909ff", 
    fillOpacity: 0.9
  },
  highlight: {
    color: "red",
    weight: 3,
    fillOpacity: 0.25,
    opacity: 1
  }
};

// Utility Functions
const $ = (id) => document.getElementById(id);

// Export for modules
if (typeof window !== 'undefined') {
  window.CONFIG = {
    DATA_PARCEL,
    DATA_BLOCK,
    DATA_ZONE,
    DATA_BOUNDARY,
    DATA_BUILDING,
    DATA_SPK,
    DATA_แปลงเกษตร,
    DATA_แปลงชุมชน,
    DATA_BPOINT,
    START_CENTER,
    START_ZOOM,
    STYLES
  };
}

console.log("✅ Config module loaded");
