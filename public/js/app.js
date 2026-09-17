/* ====================== APPLICATION INITIALIZATION ====================== */

/**
 * Initialize application
 */
(async function initApp() {
  console.log("🚀 LTAX WebGIS - Initializing...");
  console.log("Version: 1.0.0");
  console.log("Date:", new Date().toISOString());
  
  try {
    // Check required libraries
    if (typeof L === 'undefined') {
      throw new Error("Leaflet library not loaded");
    }
    
    if (typeof L.Draw === 'undefined') {
      console.warn("⚠️ Leaflet.draw not loaded - drawing features disabled");
    }
    
    if (typeof turf === 'undefined') {
      console.warn("⚠️ Turf.js not loaded - split/merge features disabled");
    }
    
    // Load all layers
    await loadAllLayers();
    
    // Application ready
    console.log("✅ Application ready!");
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺️ LTAX WebGIS - Modular Version
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Modules:
  ✓ config.js   - Configuration
  ✓ map.js      - Map initialization
  ✓ layers.js   - Layer management
  ✓ draw.js     - Draw & Edit tools
  ✓ search.js   - Search & Highlight
  ✓ storage.js  - Save & Export
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Keyboard Shortcuts:
  Ctrl+S        - Save data
  Ctrl+F        - Focus search
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    
    // Show welcome message (optional)
    showWelcomeMessage();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
  } catch (error) {
    console.error("❌ Application initialization failed:", error);
    alert(
      "เกิดข้อผิดพลาดในการเริ่มต้นระบบ\n\n" +
      error.message +
      "\n\nกรุณาตรวจสอบ Console สำหรับรายละเอียด"
    );
  }
})();

/**
 * Show welcome message (first time)
 */
function showWelcomeMessage() {
  const hasSeenWelcome = localStorage.getItem('ltax_webgis_welcome');
  
  if (!hasSeenWelcome) {
    setTimeout(() => {
      const message = `ยินดีต้อนรับสู่ LTAX WebGIS

คุณสมบัติหลัก:
• ค้นหาข้อมูลแปลงที่ดิน
• วาดและแก้ไขแปลง
• แบ่งและรวมแปลง
• บันทึกและส่งออกข้อมูล

เริ่มต้นใช้งาน:
1. เลือกเลเยอร์ที่ต้องการดู
2. ใช้กล่องค้นหาเพื่อค้นหาข้อมูล
3. ใช้ปุ่มเครื่องมือสำหรับแก้ไข

กด OK เพื่อเริ่มใช้งาน`;
      
      alert(message);
      localStorage.setItem('ltax_webgis_welcome', 'true');
    }, 1000);
  }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+F - Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      const searchInput = $("parcelInput");
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
    
    // Escape - Clear search and stop edit
    if (e.key === 'Escape') {
      if (activeEdit) {
        activeEdit.disable();
        activeEdit = null;
      }
      clearHighlight();
      map.closePopup();
    }
  });
}

/**
 * Handle errors globally
 */
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

/**
 * Check for updates periodically (optional)
 */
function checkForUpdates() {
  setInterval(async () => {
    try {
      const res = await fetch('version.json', { 
        cache: 'no-store' 
      });
      
      if (res.ok) {
        const data = await res.json();
        const currentVersion = '1.0.0';
        
        if (data.version !== currentVersion) {
          console.log(`🔄 New version available: ${data.version}`);
          
          if (confirm(`มีเวอร์ชันใหม่ ${data.version}\nต้องการรีเฟรชหน้าเพื่ออัปเดตหรือไม่?`)) {
            window.location.reload(true);
          }
        }
      }
    } catch (e) {
      // Silently fail
    }
  }, 300000); // Check every 5 minutes
}

// Uncomment to enable update checking
// checkForUpdates();

console.log("✅ App module loaded");

// ========== ปุ่ม Config: เปิด/ปิด Layer Control (Leaflet) ==========
let layerControlVisible = true; // เริ่มต้นแสดง

document.getElementById('btnLayerConfig')?.addEventListener('click', function() {
  layerControlVisible = !layerControlVisible;
  
  const layerControl = document.querySelector('.leaflet-control-layers');
  if (layerControl) {
    layerControl.style.display = layerControlVisible ? 'block' : 'none';
    console.log(layerControlVisible ? '✅ Layer Control แสดง' : '❌ Layer Control ซ่อน');
  } else {
    console.warn('⚠️ ไม่พบ Layer Control - กรุณารอสักครู่');
  }
});

// 🔧 FIX: เดิมตรงนี้เคยมี event listener ผูกกับปุ่ม #btnManageLayers (toggle เปิด/ปิดทุก layer พร้อมกัน)
// ซ้ำกับ $("btnManageLayers").onclick ใน storage.js (เปิดเมนูจัดการ Imported Layers)
// ทำให้กดปุ่ม "Config" ครั้งเดียวเกิด 2 พฤติกรรมพร้อมกัน (prompt เมนู + toggle layer เปิด/ปิด)
// ตัดสินใจแล้วว่าปุ่มนี้ควรทำหน้าที่เดียวคือจัดการ Imported Layers (ตาม storage.js)
// จึงลบ handler ตัวนี้ออก ไม่ใช้ปุ่ม #btnManageLayers ควบคุมการเปิด/ปิด layer ทั้งหมดอีกต่อไป

// ===== FIX MAP SIZE (NO TOOLBAR TOGGLE) =====
function refreshMapSize() {
  if (typeof map !== 'undefined') {
    map.invalidateSize(true);
  }
}

// โหลดครั้งแรก
window.addEventListener('load', () => {
  setTimeout(refreshMapSize, 300);
});

// หมุนจอ / เปลี่ยนขนาดจอ
window.addEventListener('resize', refreshMapSize);
window.addEventListener('orientationchange', () => {
  setTimeout(refreshMapSize, 300);
});
