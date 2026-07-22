/* ====================== PARCEL SIDEBAR (แบบ LandsPublic) ====================== */
/**
 * แสดงรายละเอียดแปลงที่ดินที่คลิก ในแผงด้านซ้าย (sidebar)
 * แทนที่/เสริมจาก popup แบบเดิม
 */

let currentSidebarFeature = null; // เก็บ feature ที่กำลังแสดงอยู่ (ใช้กับปุ่มนำทาง/Street View)
let sidebarAutoShow = true; // true = คลิกแปลงแล้วเด้ง sidebar ขึ้นเองอัตโนมัติ (ปิดได้ด้วยปุ่ม X)

const sidebar = document.getElementById('parcelSidebar');
const sidebarBody = document.getElementById('parcelSidebarBody');
const sidebarActions = document.getElementById('parcelSidebarActions');
const sidebarToggleBtn = document.getElementById('btnToggleSidebar');
const sidebarToggleIcon = document.getElementById('sidebarToggleIcon');
const btnCloseSidebar = document.getElementById('btnCloseSidebar');

/**
 * เปิด sidebar และแสดงข้อมูล properties ของแปลงที่คลิก
 * @param {Object} props - feature.properties จาก GeoJSON
 * @param {String} layerLabel - ชื่อเลเยอร์ เช่น "Parcel", "Zone"
 * @param {Object} latlng - ตำแหน่งศูนย์กลางแปลง (สำหรับปุ่มนำทาง/Street View)
 */
function showParcelSidebar(props, layerLabel, latlng) {
  currentSidebarFeature = { props, layerLabel, latlng };

  const keys = Object.keys(props || {}).filter(k => k !== 'geometry');

  let html = `<div class="mb-2"><span class="badge" style="background:#14532d;">${layerLabel}</span></div>`;
  html += '<table class="parcel-sidebar-table"><tbody>';

  if (keys.length === 0) {
    html += '<tr><td colspan="2" class="text-muted">ไม่มีข้อมูล</td></tr>';
  } else {
    keys.forEach(k => {
      const value = props[k] ?? '-';
      html += `<tr><td>${k}</td><td>${value}</td></tr>`;
    });
  }

  html += '</tbody></table>';
  sidebarBody.innerHTML = html;

  // แสดงปุ่ม action ก็ต่อเมื่อรู้ตำแหน่งของแปลง
  sidebarActions.style.display = latlng ? 'flex' : 'none';

  // เด้ง sidebar ขึ้นเองเฉพาะตอนที่ยังไม่ได้ถูกปิดไว้ (กด X แล้ว = ไม่เด้งอัตโนมัติอีก จนกว่าจะกด < > เปิดเอง)
  if (sidebarAutoShow) {
    openSidebar();
  }
}

function openSidebar() {
  sidebar.classList.remove('collapsed');
  sidebarToggleIcon.classList.remove('fa-chevron-right');
  sidebarToggleIcon.classList.add('fa-chevron-left');
  if (typeof map !== 'undefined') {
    setTimeout(() => map.invalidateSize(), 350);
  }
}

function closeSidebar() {
  sidebar.classList.add('collapsed');
  sidebarToggleIcon.classList.remove('fa-chevron-left');
  sidebarToggleIcon.classList.add('fa-chevron-right');
  if (typeof map !== 'undefined') {
    setTimeout(() => map.invalidateSize(), 350);
  }
}

sidebarToggleBtn.addEventListener('click', () => {
  if (sidebar.classList.contains('collapsed')) {
    sidebarAutoShow = true; // ผู้ใช้กดเปิดเอง -> กลับมาเด้งอัตโนมัติทุกครั้งที่คลิกแปลงอีกครั้ง
    openSidebar();
  } else {
    closeSidebar();
  }
});

btnCloseSidebar.addEventListener('click', () => {
  sidebarAutoShow = false; // กด X -> ไม่เด้งขึ้นเองอีก จนกว่าจะกดปุ่ม < > เปิดเอง
  closeSidebar();
});

// ปุ่ม "นำทาง" — เปิด Google Maps นำทางไปยังจุดศูนย์กลางแปลง
document.getElementById('btnSidebarNavigate').addEventListener('click', () => {
  if (!currentSidebarFeature || !currentSidebarFeature.latlng) return;
  const { lat, lng } = currentSidebarFeature.latlng;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank');
});

// ปุ่ม "Street View" — เปิด Google Street View ตรงจุดศูนย์กลางแปลง
document.getElementById('btnSidebarStreetView').addEventListener('click', () => {
  if (!currentSidebarFeature || !currentSidebarFeature.latlng) return;
  const { lat, lng } = currentSidebarFeature.latlng;
  const url = `https://www.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0`;
  window.open(url, '_blank');
});

// เปิดฟังก์ชันนี้ให้ไฟล์อื่นเรียกใช้ได้ (layers.js จะเรียกตอนคลิกแปลง)
window.showParcelSidebar = showParcelSidebar;

console.log("✅ Parcel sidebar module loaded");
