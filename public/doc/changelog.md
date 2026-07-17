# Changelog

## Version 1.0.0 (2024-12-17)

### ✨ Features
- เพิ่มระบบแผนที่ Leaflet
- รองรับหลายเลเยอร์ข้อมูล (Parcel, Block, Zone, Boundary, Building, SPK, แปลงชุมชน, แปลงเกษตร, Boundary Point)
- ระบบค้นหาข้อมูลแบบ multi-layer
- เครื่องมือวาดและแก้ไขแปลง (Leaflet.draw)
- ฟังก์ชันแบ่งและรวมแปลง (Turf.js)
- บันทึกข้อมูลไปยังเซิร์ฟเวอร์ (save.php)
- ดาวน์โหลด GeoJSON และ CSV
- URL parameters สำหรับ deep linking (?parcel=24A001)
- Keyboard shortcuts (Ctrl+S, Ctrl+F, Escape)
- Responsive design
- Multi-base map (OSM, Google Hybrid, Google Street, Google Satellite)

### 🔧 Technical
- โครงสร้างแบบ modular (แยกไฟล์ตาม function)
- Error handling และ fallback
- Auto-backup ก่อนบันทึก
- Logging system
- CORS support
- Cache control

### 📝 Documentation
- README.md - คู่มือการใช้งาน
- test.html - หน้าทดสอบระบบ
- CHANGELOG.md - บันทึกการเปลี่ยนแปลง
- Inline comments ในโค้ด

### 🐛 Known Issues
- Split function ต้องการ Turf.js
- Merge function ต้องการ Turf.js
- save.php ต้องการ PHP 7.0+
- ต้องมี write permission ในโฟลเดอร์ data/

---

## Roadmap

### Version 1.1.0 (Planned)
- [ ] เพิ่ม user authentication
- [ ] Multi-user collaboration
- [ ] History/Undo system
- [ ] Advanced search filters
- [ ] Batch operations
- [ ] Export to KML/Shapefile
- [ ] Print/PDF export
- [ ] Measurement tools
- [ ] Area calculation
- [ ] Database integration (PostgreSQL/MySQL)

### Version 1.2.0 (Planned)
- [ ] Mobile app version
- [ ] Offline mode
- [ ] Real-time sync
- [ ] API endpoint
- [ ] Plugin system
- [ ] Custom styling UI
- [ ] Import data wizard
- [ ] Data validation rules

---

## Support

For issues and feature requests:
- GitHub Issues: https://github.com/your-repo/webgis/issues
- Email: support@example.com
