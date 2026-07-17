# คู่มือระบบแผนที่ อบต. บน Cloudflare Workers (ฉบับสมบูรณ์)

เอกสารนี้รวบรวมทุกขั้นตอนตั้งแต่เริ่มต้น อธิบายว่าทำไมต้องทำแต่ละขั้นตอน แก้ปัญหาอะไรมาบ้าง และวิธีดูแลระบบต่อไปในอนาคต เขียนขึ้นจากประสบการณ์จริงตอนตั้งค่าโปรเจกต์ `lalom` (repo: `noom25/lalom`)

---

## สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [Cloudflare Pages กับ Workers ต่างกันอย่างไร](#2-cloudflare-pages-กับ-workers-ต่างกันอย่างไร)
3. [โครงสร้างไฟล์ในโปรเจกต์](#3-โครงสร้างไฟล์ในโปรเจกต์)
4. [ทำความเข้าใจ wrangler.jsonc](#4-ทำความเข้าใจ-wranglerjsonc)
5. [ทำความเข้าใจ _worker.js](#5-ทำความเข้าใจ-_workerjs)
6. [ระบบ Multi-tenant (รองรับหลาย อบต. ด้วย Worker เดียว)](#6-ระบบ-multi-tenant-รองรับหลาย-อบต-ด้วย-worker-เดียว)
7. [ฝั่ง Frontend ต้องแก้อะไรบ้าง](#7-ฝั่ง-frontend-ต้องแก้อะไรบ้าง)
8. [ขั้นตอนตั้งค่าตั้งแต่ศูนย์](#8-ขั้นตอนตั้งค่าตั้งแต่ศูนย์)
9. [วิธีเพิ่ม อบต. ใหม่ในอนาคต](#9-วิธีเพิ่ม-อบต-ใหม่ในอนาคต)
10. [ปัญหาที่เจอบ่อย และวิธีแก้](#10-ปัญหาที่เจอบ่อย-และวิธีแก้)
11. [Checklist ทดสอบระบบหลัง Deploy](#11-checklist-ทดสอบระบบหลัง-deploy)

---

## 1. ภาพรวมระบบ

ระบบนี้คือ **เว็บแผนที่จัดการแปลงที่ดินสำหรับ อบต.** โดยมีส่วนประกอบหลัก 3 ส่วน:

| ส่วน | หน้าที่ | เทคโนโลยี |
|---|---|---|
| **Frontend** | แสดงแผนที่ วาด/แก้ไขแปลงที่ดิน | HTML + Leaflet.js |
| **Backend (Worker)** | รับ-บันทึก/โหลดข้อมูล GeoJSON | Cloudflare Workers (`_worker.js`) |
| **ฐานข้อมูล** | เก็บข้อมูลแปลงที่ดินแบบถาวร | Cloudflare KV (key-value storage) |

**จุดออกแบบสำคัญ:** ระบบนี้ถูกออกแบบให้ **Worker ตัวเดียว + KV namespace ตัวเดียว รองรับได้หลาย อบต. พร้อมกัน** โดยแยกข้อมูลแต่ละ อบต. ด้วยการตั้งชื่อ key ใน KV ให้มี "รหัส อบต." นำหน้า วิธีนี้ทำให้ไม่ต้องสร้าง infrastructure (Worker, KV, repo) ใหม่ทุกครั้งที่มี อบต. เพิ่ม

---

## 2. Cloudflare Pages กับ Workers ต่างกันอย่างไร

ตอนเริ่มโปรเจกต์นี้ เคยสร้างเป็น **Pages project** มาก่อน แล้วเจอปัญหาซ้ำๆ เพราะ Pages กับ Workers มีกฎการ deploy ต่างกัน

| หัวข้อ | Cloudflare Pages | Cloudflare Workers |
|---|---|---|
| จุดประสงค์เดิม | โฮสต์เว็บ static เป็นหลัก | รัน compute/serverless function |
| โดเมนที่ได้ | `*.pages.dev` | `*.workers.dev` |
| ไฟล์ backend | ใช้ `_worker.js` แบบ "advanced mode" ซึ่งมีกฎเข้มงวดเรื่องการอัปโหลดไฟล์นี้เป็น asset | รองรับ static assets ผ่าน field `"assets"` ใน `wrangler.jsonc` ได้อย่างยืดหยุ่นกว่า |
| ปัญหาที่เจอ | error `Uploading a Pages _worker.js file as an asset` ทุกครั้งที่ deploy เพราะ `_worker.js` ถูกวางปนกับโฟลเดอร์ asset | ไม่มีปัญหานี้ ถ้าแยกโฟลเดอร์ asset กับ `_worker.js` ออกจากกันชัดเจน |

**บทเรียนสำคัญ:** ทางออกที่ยั่งยืนที่สุดคือ **แยก `_worker.js` ออกจากโฟลเดอร์ asset ตั้งแต่ต้น** ไม่ว่าจะ deploy เป็น Pages หรือ Workers ก็ตาม โปรเจกต์นี้ตั้งใจใช้เป็น **Workers project** (ได้โดเมนแบบ `*.workers.dev`)

---

## 3. โครงสร้างไฟล์ในโปรเจกต์

```
lalom/                          ← root ของ repo
├── _worker.js                  ← โค้ด backend (Worker script)
├── wrangler.jsonc               ← ไฟล์ config หลักของ Cloudflare
├── README.md
└── public/                      ← โฟลเดอร์ asset (static files)
    ├── index.html                 ← หน้าเว็บหลัก
    ├── css/                        ← สไตล์
    ├── js/
    │   ├── config.js                ← ตั้งค่า URL ข้อมูล/ลิงก์ layer ต่างๆ
    │   ├── map.js                    ← ตั้งค่าแผนที่ Leaflet เบื้องต้น
    │   ├── layers.js                  ← โหลด/แสดง layer ต่างๆ บนแผนที่
    │   ├── draw.js                     ← ฟังก์ชันวาด/แก้ไข/แบ่ง/รวมแปลง
    │   ├── search.js                    ← ค้นหาแปลงที่ดิน
    │   ├── storage.js                    ← บันทึก/export ข้อมูล
    │   └── app.js                         ← เริ่มต้นแอปทั้งหมด
    └── data/                       ← ไฟล์ GeoJSON ตั้งต้น (ใช้ตอนยังไม่เคยบันทึกอะไร)
```

**เหตุผลที่ต้องแยก `_worker.js` ออกจาก `public/`:**
Cloudflare จะสแกนทุกไฟล์ในโฟลเดอร์ที่ตั้งเป็น `assets.directory` แล้วเตรียมอัปโหลดเป็นไฟล์ static ทั้งหมด ถ้า `_worker.js` (ซึ่งเป็นโค้ด backend ที่ควรรันบนเซิร์ฟเวอร์เท่านั้น) ถูกวางอยู่ในโฟลเดอร์เดียวกัน Cloudflare จะไม่แน่ใจว่าคุณต้องการให้มันถูกดาวน์โหลดเป็นไฟล์ static ด้วยหรือเปล่า (ซึ่งจะเปิดเผยโค้ด backend ให้คนภายนอกเห็น) จึงหยุด deploy พร้อม error ไว้ก่อน

---

## 4. ทำความเข้าใจ wrangler.jsonc

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "lalom",                    // ชื่อ Worker บน Cloudflare — ต้องตรงกับชื่อ project ใน dashboard
  "main": "_worker.js",               // ไฟล์ entry point ของ backend
  "compatibility_date": "2026-07-16",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "public",            // โฟลเดอร์ที่เก็บไฟล์ static (แยกจาก _worker.js)
    "binding": "ASSETS"               // ชื่อตัวแปรที่ใช้เรียกไฟล์ static จากในโค้ด _worker.js
  },
  "kv_namespaces": [
    {
      "binding": "PARCEL_KV",         // ชื่อตัวแปรที่โค้ดใช้เรียก KV (ต้องตรงกับใน _worker.js)
      "id": "f5d59bd667e74533a92894342a3e4db1"  // ID ของ KV namespace บน Cloudflare
    }
  ],
  "observability": {
    "enabled": true                   // เปิด logging เพื่อ debug ทีหลังได้
  }
}
```

**จุดที่ผิดพลาดบ่อย:**
- ชื่อ `"binding"` ของ KV ต้องตรงกับที่โค้ดเรียกใช้เป๊ะๆ (เช่น `env.PARCEL_KV`) ถ้าไม่ตรง โค้ดจะได้ `undefined` แล้ว error ทันที
- `"id"` ของ KV ต้องเป็น namespace ที่มีอยู่จริงบน Cloudflare (เช็คได้ที่ Dashboard → Workers & Pages → KV)
- `"directory"` ใน `assets` ต้องชี้ไปที่โฟลเดอร์ static เท่านั้น **ห้ามเป็น `"."` (root)** เพราะจะทำให้ `_worker.js` ถูกนับเป็น asset ไปด้วย

---

## 5. ทำความเข้าใจ _worker.js

หน้าที่ของ `_worker.js` คือรับ request ทุกอย่างที่เข้ามา แล้วตัดสินใจว่า:
- ถ้า URL คือ `/api/save` (POST) หรือ `/api/load` (GET) → รันฟังก์ชัน backend ของเราเอง (อ่าน/เขียนข้อมูลใน KV)
- ถ้าไม่ใช่ → ส่งต่อให้ Cloudflare เสิร์ฟไฟล์ static จากโฟลเดอร์ `public/` ตามปกติ (ผ่าน `env.ASSETS.fetch(request)`)

```js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/save" && request.method === "POST") {
      return handleSave(request, env, url);
    }
    if (url.pathname === "/api/load" && request.method === "GET") {
      return handleLoad(request, env, url);
    }

    // ไม่ใช่ API ของเรา -> ส่งต่อให้เสิร์ฟไฟล์ static ตามปกติ
    return env.ASSETS.fetch(request);
  },
};
```

### ฟังก์ชันหลัก
- **`handleSave`** — รับ GeoJSON จาก frontend, บันทึกลง KV เป็นข้อมูลหลัก + สร้าง backup รายวัน + ลบ backup ที่เก่าเกิน 30 วันทิ้งอัตโนมัติ
- **`handleLoad`** — ดึงข้อมูล GeoJSON ล่าสุดที่เคยบันทึกไว้กลับมาให้ frontend

---

## 6. ระบบ Multi-tenant (รองรับหลาย อบต. ด้วย Worker เดียว)

เดิมทีถ้าเพิ่ม อบต. ใหม่ 1 แห่ง จะต้องสร้าง repo ใหม่, Worker ใหม่, KV namespace ใหม่ — ซึ่งจัดการยากขึ้นเรื่อยๆ เมื่อจำนวน อบต. เพิ่มขึ้น จึงเปลี่ยนมาใช้ **Worker เดียว + KV เดียว** แล้วแยกข้อมูลด้วยการตั้งชื่อ key

### หลักการ
ทุก request ไปยัง `/api/save` และ `/api/load` ต้องแนบ **query parameter `?abt=<รหัส>`** มาด้วย เช่น:
```
POST /api/save?abt=lalom
GET  /api/load?abt=lalom
```

โค้ดจะเก็บข้อมูลลง KV โดยใช้ key แบบมี prefix:
```
abt-lalom:parcel.geojson
abt-lalom:backup-2026-07-17.geojson
abt-ltaxmap:parcel.geojson
abt-ltaxmap:backup-2026-07-17.geojson
```

### รายชื่อ อบต. ที่อนุญาต
ใน `_worker.js` มีตัวแปร whitelist กันพิมพ์ผิด/กันสร้าง key มั่ว:
```js
const ALLOWED_ABT = ["lalom", "ltaxmap"];
```
ถ้าเรียก API โดยไม่ส่ง `abt` หรือส่งรหัสที่ไม่อยู่ในลิสต์นี้ ระบบจะตอบกลับ error `400` ทันที (กันข้อมูลปนกันโดยไม่ตั้งใจ)

### ข้อดีของวิธีนี้
- ✅ เพิ่ม อบต. ใหม่ = แก้โค้ด 2 จุดเท่านั้น ไม่ต้องสร้าง infrastructure ใหม่
- ✅ ข้อมูลแต่ละ อบต. แยกกันเด็ดขาด ไม่มีทางปนกัน
- ✅ ดูแล/แก้ไขโค้ดจุดเดียว ใช้ได้กับทุก อบต.

---

## 7. ฝั่ง Frontend ต้องแก้อะไรบ้าง

Frontend เดิมเรียก `fetch('/api/save')` และ `fetch('/api/load')` เฉยๆ โดยไม่มีการระบุ อบต. ต้องแก้ 3 ไฟล์:

### 7.1 `index.html` — กำหนดรหัส อบต. ของเว็บนี้
เพิ่มก่อนโหลดสคริปต์อื่นๆ ทั้งหมด:
```html
<script>
  // รหัส อบต. สำหรับเว็บไซต์นี้ — ต้องตรงกับรายชื่อ ALLOWED_ABT ใน _worker.js
  window.ABT_CODE = "lalom";
</script>
<script src="js/config.js"></script>
```

### 7.2 `js/layers.js` — ส่ง `abt` ตอนโหลดข้อมูล
```js
const abtParam = encodeURIComponent(window.ABT_CODE || "");
const savedRes = await fetch(`/api/load?abt=${abtParam}`, { cache: "no-store" });
```

### 7.3 `js/storage.js` — ส่ง `abt` ตอนบันทึกข้อมูล
```js
const abtParam = encodeURIComponent(window.ABT_CODE || "");
const saveUrl = `/api/save?abt=${abtParam}`;
```

**หมายเหตุ:** ถ้าแต่ละ อบต. มีหน้าเว็บ (`index.html`) แยกกันคนละชุด (เพราะข้อมูล layer พื้นฐานต่างกัน) ให้เปลี่ยนแค่ค่า `window.ABT_CODE` ในแต่ละชุดให้ตรงกับ อบต. นั้นๆ โดยที่ `_worker.js`, `wrangler.jsonc` ยังใช้ตัวเดียวกันได้

---

## 8. ขั้นตอนตั้งค่าตั้งแต่ศูนย์

### ขั้นที่ 1 — สร้าง KV Namespace (ทำครั้งเดียว ใช้ได้ตลอด)
1. เข้า Cloudflare Dashboard → เมนูซ้าย **Storage & Databases → Workers KV**
2. กด **Create** ตั้งชื่อ (เช่น `parcel-data-shared`)
3. คัดลอก **ID** ที่ได้มาเก็บไว้ (จะใช้ใส่ใน `wrangler.jsonc`)

### ขั้นที่ 2 — เตรียมไฟล์ในเครื่อง/Git repo
จัดโครงสร้างตามหัวข้อ [3. โครงสร้างไฟล์ในโปรเจกต์](#3-โครงสร้างไฟล์ในโปรเจกต์) ให้ครบ:
- `_worker.js` ที่ root
- `wrangler.jsonc` ที่ root (ใส่ KV ID ที่ได้จากขั้นที่ 1)
- โฟลเดอร์ `public/` เก็บไฟล์ static ทั้งหมด

### ขั้นที่ 3 — Push ขึ้น GitHub
```bash
git add .
git commit -m "Setup multi-tenant Worker structure"
git push
```

### ขั้นที่ 4 — สร้าง/เชื่อม Worker บน Cloudflare Dashboard
1. **Workers & Pages → Create → Import a repository** (หรือเชื่อม repo เดิมถ้ามีอยู่แล้ว)
2. เลือก repo ที่ต้องการ (เช่น `noom25/lalom`)
3. ตั้งค่า **Deploy command**: `npx wrangler deploy`
4. Build command ปล่อยว่างได้ (ไม่มีขั้นตอน build)
5. กด Deploy

### ขั้นที่ 5 — เปิดใช้งาน Worker URL
1. เข้าไปที่ project → แท็บ **Domains**
2. กด toggle เปิด **Production** (`<worker-name>.<subdomain>.workers.dev`)
3. รอ 10-30 วินาที แล้วลองเข้า URL

### ขั้นที่ 6 — ตรวจสอบ Bindings
เข้าไปที่แท็บ **Bindings** เช็คว่ามีครบ:
- **Assets** → ASSETS
- **KV namespace** → PARCEL_KV → ผูกกับ namespace ที่สร้างไว้

---

## 9. วิธีเพิ่ม อบต. ใหม่ในอนาคต

ไม่ต้องสร้าง Worker หรือ KV ใหม่เลย ทำแค่ 2 จุด:

### จุดที่ 1 — แก้ `_worker.js`
เพิ่มรหัส อบต. ใหม่เข้าไปใน whitelist:
```js
const ALLOWED_ABT = ["lalom", "ltaxmap", "รหัสอบตใหม่"];
```

### จุดที่ 2 — เตรียม index.html สำหรับ อบต. ใหม่
- ถ้าใช้หน้าเว็บเดียวกันทั้งหมด (URL เดียว ให้ผู้ใช้เลือก อบต. เอง) → ต้องปรับ logic เพิ่มเติมให้เลือก `ABT_CODE` แบบ dynamic (เช่นจาก URL parameter หรือหน้าจอเลือก อบต.)
- ถ้าแต่ละ อบต. มีเว็บแยกกัน (คนละ path หรือคนละ repo ที่ deploy ไปยัง Worker เดียวกัน) → คัดลอกชุด `index.html` + `js/` เดิม แล้วแก้แค่:
  ```html
  window.ABT_CODE = "รหัสอบตใหม่";
  ```
  พร้อมเปลี่ยนไฟล์ข้อมูลตั้งต้นใน `data/` ให้เป็นของ อบต. นั้น

### จุดที่ 3 — commit + push + retry build
เสร็จแล้ว อบต. ใหม่จะมีข้อมูลแยกเป็นสัดส่วนอัตโนมัติ ไม่ปนกับ อบต. อื่น

---

## 10. ปัญหาที่เจอบ่อย และวิธีแก้

### ❌ `Uploading a Pages _worker.js file as an asset`
**สาเหตุ:** `_worker.js` อยู่ในโฟลเดอร์เดียวกับที่ตั้งเป็น `assets.directory`
**วิธีแก้ที่แนะนำ:** ย้าย `_worker.js` ออกมาไว้ที่ root แยกจากโฟลเดอร์ asset (เช่น `public/`) แล้วตั้ง `"assets": { "directory": "public" }` ใน `wrangler.jsonc`
**วิธีแก้ชั่วคราว (ถ้าจำเป็น):** สร้างไฟล์ `.assetsignore` (สังเกตว่าต้องขึ้นต้นด้วย **จุด** ไม่ใช่ขีดล่าง `_`) ใส่ข้อความ `_worker.js` ไว้ข้างใน วางไว้ที่ root ของ asset directory

### ❌ Failed to match Worker name
**สาเหตุ:** ชื่อใน `"name"` ของ `wrangler.jsonc` ไม่ตรงกับชื่อ project บน Cloudflare dashboard
**วิธีแก้:** แก้ `"name"` ใน `wrangler.jsonc` ให้ตรงกับชื่อ project (ไม่กระทบการ deploy เพราะ CI จะ override ให้อัตโนมัติ แต่ควรแก้ให้ตรงเพื่อความเรียบร้อย)

### ❌ Worker deploy สำเร็จ แต่เข้าเว็บไม่ได้ ("No active routes")
**สาเหตุ:** ยังไม่ได้เปิดใช้งาน `workers.dev` subdomain
**วิธีแก้:** เข้า project → แท็บ **Domains** → กด toggle เปิด **Production**

### ❌ กด "บันทึก" แล้ว error 400 "ไม่ระบุ อบต."
**สาเหตุ:** Frontend เรียก `/api/save` หรือ `/api/load` โดยไม่มี `?abt=...` หรือรหัสไม่อยู่ใน `ALLOWED_ABT`
**วิธีแก้:** เช็คว่า `window.ABT_CODE` ใน `index.html` ถูกตั้งค่าไว้ และตรงกับรายชื่อใน `_worker.js`

### ❌ ข้อมูลหาย/ไม่โผล่หลัง deploy ใหม่
**สาเหตุที่เป็นไปได้:** ใช้ KV namespace ID คนละตัวกับที่เคยบันทึกข้อมูลไว้
**วิธีแก้:** เช็ค `"id"` ใน `kv_namespaces` ของ `wrangler.jsonc` ว่าตรงกับ namespace ที่มีข้อมูลอยู่จริง (เช็ค Storage size ได้ที่ Dashboard → Workers KV)

---

## 11. Checklist ทดสอบระบบหลัง Deploy

- [ ] เข้า URL `https://<worker-name>.<subdomain>.workers.dev` ได้ ไม่ขึ้น error
- [ ] แผนที่และ layer ต่างๆ โหลดขึ้นมาปกติ (เช็ค Console กด F12 ว่าไม่มี error สีแดง)
- [ ] ลองวาด/แก้ไขแปลงที่ดิน แล้วกด **บันทึก** → ขึ้นข้อความ `✅ บันทึกเรียบร้อย (อบต: <รหัส>)`
- [ ] Reload หน้าเว็บใหม่ → ข้อมูลที่เพิ่งบันทึกยังอยู่ (พิสูจน์ว่า `/api/load` ทำงานถูกต้อง)
- [ ] เช็ค Dashboard → Workers KV → namespace ที่ใช้ → Storage size เพิ่มขึ้นจาก 0 B (พิสูจน์ว่าบันทึกลง KV จริง)
- [ ] ถ้ามีมากกว่า 1 อบต. → ลองสลับ `ABT_CODE` แล้วเช็คว่าข้อมูลแต่ละ อบต. ไม่ปนกัน

---

*เอกสารนี้จัดทำขึ้นจากประสบการณ์ตั้งค่าจริงของโปรเจกต์ `noom25/lalom` — อัปเดตล่าสุดตามสถานะระบบล่าสุดที่ deploy สำเร็จ*
