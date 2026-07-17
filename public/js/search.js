/* ====================== SEARCH & HIGHLIGHT ====================== */

const infoBox = $("searchInfo");
let lastHighlighted = [];
let currentMatches = [];

/**
 * Clear all highlights
 */
function clearHighlight() {
  lastHighlighted.forEach(layer => {
    try {
      if (layer.setStyle) {
        layer.setStyle({ 
          color: layer.defaultColor || STYLES.parcel.color, 
          weight: 1.4, 
          fillOpacity: 0 
        });
      }
    } catch(e) {
      console.warn("Could not reset style:", e);
    }
  });
  lastHighlighted = [];
  currentMatches = [];
  
  if (infoBox) {
    infoBox.innerHTML = "";
  }
}

/**
 * Normalize Thai digits (๐-๙) to Arabic digits (0-9)
 */
function normalizeDigits(str) {
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
  return str.replace(/[๐-๙]/g, d => thaiDigits.indexOf(d).toString());
}

/**
 * Parse search input into terms.
 * Supports: "field:value" for specific field, plain words = AND across all fields
 * e.g. "code:1234 สมชาย" -> [{field:'code', value:'1234'}, {field:null, value:'สมชาย'}]
 */
function parseSearchTerms(raw) {
  const cleaned = normalizeDigits(raw.trim().toLowerCase());
  const parts = cleaned.split(/\s+/).filter(Boolean);
  
  return parts.map(part => {
    const m = part.match(/^([a-zA-Z_]+):(.+)$/);
    if (m) {
      return { field: m[1], value: m[2] };
    }
    return { field: null, value: part };
  });
}

/**
 * Check if a feature's properties match all given terms (AND logic)
 */
function matchesTerms(props, terms) {
  return terms.every(term => {
    if (term.field) {
      // Search specific field (match by key name, case-insensitive, partial key match)
      const matchingKeys = Object.keys(props).filter(k => 
        k.toLowerCase().includes(term.field.toLowerCase())
      );
      if (matchingKeys.length === 0) return false;
      
      return matchingKeys.some(k => {
        const val = props[k];
        if (val === null || val === undefined) return false;
        return normalizeDigits(val.toString().toLowerCase()).includes(term.value);
      });
    } else {
      // Search across all fields
      return Object.values(props).some(val => {
        if (val === null || val === undefined) return false;
        return normalizeDigits(val.toString().toLowerCase()).includes(term.value);
      });
    }
  });
}

/**
 * Search across layers by keyword(s)
 */
function searchByLayerAndField() {
  const rawInput = $("parcelInput").value || "";
  const selectedLayer = $("layerSelect")?.value || "__all__";
  
  if (!rawInput.trim()) { 
    alert("กรุณาใส่คำค้นหา"); 
    return; 
  }

  clearHighlight();
  map.closePopup();
  
  const terms = parseSearchTerms(rawInput);
  let resultSummary = [];
  let allMatches = [];

  const targetLayers = selectedLayer === "__all__"
    ? Object.entries(overlayMaps)
    : [[selectedLayer, overlayMaps[selectedLayer]]];

  for (const [layerName, layerGroup] of targetLayers) {
    if (!layerGroup || !map.hasLayer(layerGroup)) {
      continue;
    }
    
    let matches = [];
    
    layerGroup.eachLayer(layer => {
      const props = layer.feature?.properties || {};
      if (matchesTerms(props, terms)) {
        matches.push({ layer, layerName, props });
      }
    });
    
    if (matches.length > 0) {
      matches.forEach(m => {
        try {
          if (m.layer.setStyle) {
            m.layer.setStyle(STYLES.highlight);
          }
        } catch(e) {
          console.warn("Could not highlight layer:", e);
        }
      });
      
      lastHighlighted.push(...matches.map(m => m.layer));
      allMatches.push(...matches);
      resultSummary.push(`${layerName}: ${matches.length}`);
    }
  }

  currentMatches = allMatches;

  if (allMatches.length > 0) {
    renderResultsList(allMatches, resultSummary);
    console.log(`🔍 Found ${allMatches.length} matches:`, resultSummary);
    zoomToMatch(allMatches[0]);
  } else {
    infoBox.innerHTML = "❌ ไม่พบข้อมูล";
    console.log("❌ No matches found");
    alert(`ไม่พบข้อมูลที่ตรงกับ "${rawInput}"`);
  }
}

/**
 * Zoom to a single match and open its popup
 */
function zoomToMatch(match) {
  try {
    if (match.layer.getBounds) {
      map.fitBounds(match.layer.getBounds(), { maxZoom: 21, padding: [50, 50] });
    } else if (match.layer.getLatLng) {
      map.setView(match.layer.getLatLng(), 21);
    }
    match.layer.openPopup();
  } catch(e) {
    console.warn("Could not zoom to match:", e);
  }
}

/**
 * Render clickable results list in the info box
 */
function renderResultsList(matches, resultSummary) {
  const header = `🔍 พบ ${matches.length} รายการ (${resultSummary.join(" | ")})`;
  
  const listHtml = matches.map((m, i) => {
    // Try common field names for a display label
    const label = m.props.parcel_code || m.props.parcel_cod 
      || m.props.OWNER_NAME || m.props.name 
      || `รายการที่ ${i + 1}`;
    return `<div class="search-result-item" data-index="${i}" style="cursor:pointer;padding:4px;border-bottom:1px solid #eee;">
      ${i + 1}. ${label} <span style="color:#888;font-size:0.85em;">(${m.layerName})</span>
    </div>`;
  }).join("");
  
  infoBox.innerHTML = `<div>${header}</div><div class="search-results-list" style="max-height:200px;overflow-y:auto;margin-top:6px;">${listHtml}</div>`;
  
  // Attach click handlers to jump to each match
  infoBox.querySelectorAll(".search-result-item").forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.index, 10);
      zoomToMatch(currentMatches[idx]);
    };
  });
}

/**
 * Highlight specific parcel by code (used externally, e.g. from bookmarklet link)
 */
function highlightParcel(code) {
  let found = false;
  
  if (!parcelLayer) { 
    console.warn("⚠️ Parcel layer not loaded yet"); 
    return; 
  }
  
  clearHighlight();
  map.closePopup();
  
  const normalizedCode = normalizeDigits(code.toString());
  
  parcelLayer.eachLayer(layer => {
    const props = layer.feature?.properties || {};
    
    if (props.parcel_code == normalizedCode || props.parcel_cod == normalizedCode) {
      try {
        layer.setStyle(STYLES.highlight);
        map.fitBounds(layer.getBounds(), {
          maxZoom: 21,
          padding: [50, 50]
        });
        layer.openPopup();
        lastHighlighted.push(layer);
        found = true;
        
        console.log(`✅ Found parcel: ${code}`);
      } catch(e) {
        console.error("Error highlighting parcel:", e);
      }
    }
  });
  
  if (!found) {
    console.warn(`❌ Parcel not found: ${code}`);
    alert(`❌ ไม่พบแปลงรหัส ${code}`);
  }
  
  return found;
}

/**
 * Button: Search
 */
$("searchBtn").onclick = searchByLayerAndField;

/**
 * Input: Enter key to search
 */
$("parcelInput").onkeydown = (e) => { 
  if (e.key === "Enter") {
    searchByLayerAndField();
  }
};

/**
 * Button: Clear search
 */
$("clearBtn").onclick = () => { 
  $("parcelInput").value = ""; 
  clearHighlight(); 
  map.closePopup();
  console.log("🔄 Search cleared");
};

console.log("✅ Search module loaded (enhanced)");