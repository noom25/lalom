# 🗺️ LTAX WebGIS - Modular Version

ระบบสารสนเทศภูมิศาสตร์สำหรับจัดการข้อมูลที่ดินและแปลงที่ดิน

## 📋 คุณสมบัติ

### 🔍 การค้นหา
- ค้นหาข้อมูลแปลงที่ดินจากทุกเลเยอร์
- ค้นหาด้วย parcel_code, zone, block หรือข้อมูลอื่นๆ
- Highlight แปลงที่ค้นพบ
- รองรับ URL parameter: `?parcel=24A001`

### ✏️ การแก้ไข
- วาดแปลงใหม่
- แก้ไขแปลงที่มีอยู่
- ลบแปลง
- แบ่งแปลง (ต้องการ Turf.js)
- รวมแปลง (ต้องการ Turf.js)

### 💾 การบันทึก
- บันทึกไปยังเซิร์ฟเวอร์ (ผ่าน save.php)
- ดาวน์โหลดเป็นไฟล์ GeoJSON
- ส่งออกเป็น CSV
- Keyboard shortcut: Ctrl+S

### 🗺️ แผนที่ฐาน
- OpenStreetMap
- Google Hybrid
- Google Street
- Google Satellite

## 📁 โครงสร้างไฟล์

```
/webgis/
├── index.html              # หน้าหลัก
├── css/
│   └── style.css          # สไตล์
├── js/
│   ├── config.js          # การตั้งค่า
│   ├── map.js             # จัดการแผนที่
│   ├── layers.js          # จัดการเลเยอร์
│   ├── draw.js            # เครื่องมือวาดและแก้ไข
│   ├── search.js          # การค้นหา
│   ├── storage.js         # บันทึกและส่งออก
│   └── app.js             # เริ่มต้นแอป
├── data/                   # ไฟล์ข้อมูล GeoJSON
│   ├── parcel.geojson
│   ├── block.geojson
│   ├── zone.geojson
│   ├── boundary.geojson
│   ├── building.geojson
│   ├── spk.geojson
│   ├── แปลงชุมชน.geojson
│   ├── แปลงเกษตร.geojson
│   └── boundarypoint.geojson
└── save.php               # Backend สำหรับบันทึก (PHP)
```

## 🚀 การติดตั้ง

### 1. วางไฟล์บนเว็บเซิร์ฟเวอร์

```bash
# คัดลอกไฟล์ทั้งหมดไปยัง web root
cp -r webgis/ /var/www/html/
```

### 2. ตั้งค่าสิทธิ์ไฟล์

```bash
chmod 755 /var/www/html/webgis/
chmod 644 /var/www/html/webgis/data/*.geojson
```

### 3. สร้างไฟล์บันทึก (save.php)

```php
<?php
header('Content-Type: application/json');

// รับข้อมูล GeoJSON
$json = file_get_contents('php://input');
$data = json_decode($json);

if ($data) {
    // บันทึกลงไฟล์
    $file = 'data/parcel.geojson';
    $result = file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
    
    if ($result !== false) {
        echo json_encode([
            'success' => true,
            'message' => 'บันทึกข้อมูลเรียบร้อย',
            'features' => count($data->features)
        ]);
    } else {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'ไม่สามารถบันทึกได้'
        ]);
    }
} else {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'ข้อมูลไม่ถูกต้อง'
    ]);
}
?>
```

## 🔧 การตั้งค่า

### แก้ไขใน `js/config.js`:

```javascript
// ปรับตำแหน่งเริ่มต้น
const START_CENTER = [14.6005, 104.2500];
const START_ZOOM   = 15;

// ปรับเส้นทางไฟล์ข้อมูล
const DATA_PARCEL = "data/parcel.geojson";

// ปรับสี
const STYLES = {
  parcel: { color: "#17ff3e", weight: 1.4 },
  // ...
};
```

## 📱 การใช้งาน

### การค้นหา
1. เลือกเลเยอร์จากดรอปดาวน์ (หรือเลือก "ทุกเลเยอร์")
2. พิมพ์คำค้นหาในช่องค้นหา
3. กดปุ่ม "ค้นหา" หรือ Enter
4. กด "ล้าง" เพื่อล้างผลค้นหา

### การวาดแปลง
1. กดปุ่ม "➕ วาด"
2. คลิกบนแผนที่เพื่อวาดจุดยอด
3. คลิกซ้ำที่จุดแรกเพื่อปิดรูป

### การแก้ไข
1. กดปุ่ม "✏️ แก้ไข"
2. คลิกแปลงที่ต้องการแก้ไข
3. ลากจุดยอดเพื่อปรับรูปร่าง
4. กด "⛔ หยุด" เมื่อเสร็จ

### การรวมแปลง
1. กดปุ่ม "รวมแปลง"
2. คลิกเลือกแปลงที่ต้องการรวม (2 แปลงขึ้นไป)
3. กดปุ่ม "รวมแปลง" อีกครั้ง

### การบันทึก
1. กดปุ่ม "💾 บันทึก" หรือกด Ctrl+S
2. ข้อมูลจะถูกส่งไปยังเซิร์ฟเวอร์
3. หากไม่สำเร็จ จะดาวน์โหลดเป็นไฟล์แทน

## ⌨️ Keyboard Shortcuts

- `Ctrl+S` - บันทึกข้อมูล
- `Ctrl+F` - โฟกัสช่องค้นหา
- `Escape` - ยกเลิก/หยุดการแก้ไข

## 🌐 URL Parameters

เปิดแผนที่พร้อม highlight แปลงที่ต้องการ:

```
https://example.com/webgis/?parcel=24A001
```

## 🔗 Dependencies

- [Leaflet 1.9.3](https://leafletjs.com/)
- [Leaflet.draw 1.0.4](https://github.com/Leaflet/Leaflet.draw)
- [Turf.js 6.x](https://turfjs.org/) (สำหรับ split/merge)

## 📄 ไฟล์ข้อมูล

ไฟล์ GeoJSON ทั้งหมดต้องอยู่ในโฟลเดอร์ `data/` และมีรูปแบบ:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "parcel_code": "24A001",
        "zone": "A",
        "block": "24",
        "lot": "001"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[...]]]
      }
    }
  ]
}
```

## 🐛 การแก้ปัญหา

### แผนที่ไม่แสดง
- ตรวจสอบ Console (F12)
- ตรวจสอบว่าไฟล์ CSS และ JS โหลดสำเร็จ

### ข้อมูลไม่แสดง
- ตรวจสอบว่าไฟล์ GeoJSON อยู่ในโฟลเดอร์ `data/`
- ตรวจสอบรูปแบบ GeoJSON ว่าถูกต้อง
- ตรวจสอบ CORS policy

### ไม่สามารถบันทึกได้
- ตรวจสอบว่า `save.php` มีสิทธิ์ในการเขียนไฟล์
- ตรวจสอบว่าโฟลเดอร์ `data/` มีสิทธิ์เขียน

## 📞 ติดต่อ

- เอกสาร: [https://github.com/your-repo/webgis](https://github.com/your-repo/webgis)
- Issues: [https://github.com/your-repo/webgis/issues](https://github.com/your-repo/webgis/issues)

## 📜 License

MIT License - ใช้งานและแก้ไขได้อย่างอิสระ

---

**LTAX WebGIS** © 2024 - Made with ❤️ in Thailand
