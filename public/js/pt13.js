/* ====================== โหลดเอกสาร ผ.ท.13 จากคลาวด์ ====================== */
/**
 * แนวคิด: เอกสาร ผ.ท.13 เป็นรูปที่สร้างไว้ล่วงหน้าแล้ว (จาก QGIS หรือโปรแกรมอื่น)
 * เก็บไว้ในโฟลเดอร์ "reports/" ของเว็บ โดยตั้งชื่อไฟล์ตามรหัสแปลง (parcel_code)
 * เช่น รหัสแปลง "04M016/001" -> ไฟล์ชื่อ "reports/04M016_001.png"
 * (ต้องแทนเครื่องหมาย / ด้วย _ เพราะ / ใช้ในชื่อไฟล์ไม่ได้)
 *
 * พอคลิกแปลงบนแผนที่ -> กดปุ่ม "โหลด ผ.ท.13" -> ระบบหาไฟล์ที่ตรงรหัสแปลงนั้น
 * แล้วดาวน์โหลดลงเครื่องให้อัตโนมัติ
 */

// นามสกุลไฟล์ที่ใช้เก็บเอกสาร (เปลี่ยนเป็น "pdf" ได้ถ้าเก็บเป็น PDF แทนรูปภาพ)
const PT13_FILE_EXT = "png";

/**
 * ลองหาค่าจาก properties โดยเทียบชื่อ field แบบยืดหยุ่น
 */
function pt13GetField(props, candidates) {
  if (!props) return "";
  const keys = Object.keys(props);

  for (const cand of candidates) {
    const found = keys.find(k => k.toLowerCase() === cand.toLowerCase());
    if (found && props[found] !== null && props[found] !== undefined && props[found] !== "") {
      return props[found];
    }
  }
  for (const cand of candidates) {
    const found = keys.find(k => k.toLowerCase().includes(cand.toLowerCase()));
    if (found && props[found] !== null && props[found] !== undefined && props[found] !== "") {
      return props[found];
    }
  }
  return "";
}

/**
 * แปลงรหัสแปลงให้เป็นชื่อไฟล์ที่ปลอดภัย (แทน / ด้วย _)
 */
function pt13SafeFileName(parcelCode) {
  return String(parcelCode).trim().replace(/[\/\\]/g, "_");
}

async function downloadPT13() {
  if (!currentSidebarFeature) {
    alert("กรุณาคลิกเลือกแปลงที่ดินบนแผนที่ก่อน แล้วค่อยกดโหลดเอกสาร");
    return;
  }

  const props = currentSidebarFeature.props;
  const parcelCode = pt13GetField(props, ["parcel_code", "parcel_cod", "code", "id"]);

  if (!parcelCode) {
    alert("ไม่พบรหัสแปลง (parcel_code) ในข้อมูลแปลงนี้ จึงไม่ทราบว่าต้องโหลดไฟล์ไหน");
    return;
  }

  const safeName = pt13SafeFileName(parcelCode);
  const url = `/reports/${safeName}.${PT13_FILE_EXT}`;

  const btn = document.getElementById('btnSidebarPT13');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>กำลังโหลด...';
  btn.disabled = true;

  try {
    // เช็คก่อนว่ามีไฟล์นี้เก็บไว้จริงไหม ก่อนสั่งดาวน์โหลด
    const res = await fetch(url, { method: "HEAD" });

    if (!res.ok) {
      alert(
        `ไม่พบเอกสาร ผ.ท.13 สำหรับแปลงรหัส "${parcelCode}"\n\n` +
        `(ยังไม่ได้อัปโหลดไฟล์ ${safeName}.${PT13_FILE_EXT} ไว้ในโฟลเดอร์ reports/ ของเว็บ)`
      );
      return;
    }

    // ดาวน์โหลดไฟล์ลงเครื่อง
    const a = document.createElement('a');
    a.href = url;
    a.download = `ผท13_${safeName}.${PT13_FILE_EXT}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    console.log(`✅ ดาวน์โหลด ผ.ท.13 ของแปลง ${parcelCode} สำเร็จ`);
  } catch (err) {
    alert("เกิดข้อผิดพลาดในการโหลดเอกสาร: " + err.message);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

document.getElementById('btnSidebarPT13')?.addEventListener('click', downloadPT13);

console.log("✅ ผ.ท.13 download module loaded");
