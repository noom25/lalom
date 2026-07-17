/**
 * _worker.js
 * ไฟล์นี้ต้องวางไว้ที่ "root" ของ repo (คนละระดับกับโฟลเดอร์ public/ ที่เก็บไฟล์ static)
 *
 * รองรับ "หลาย อบต." ด้วย Worker + KV namespace ตัวเดียว
 * แยกข้อมูลแต่ละ อบต. ด้วย key prefix เช่น "abt-lalom:parcel.geojson"
 *
 * วิธีเรียกใช้จาก frontend:
 *   POST /api/save?abt=lalom      body: GeoJSON
 *   GET  /api/load?abt=lalom
 *
 * ต้องผูก KV Namespace ชื่อ "PARCEL_KV" กับ Worker นี้ก่อนใช้งานได้
 * (ตั้งค่าใน wrangler.jsonc อยู่แล้ว)
 */

const RETENTION_DAYS = 30; // เก็บ backup ย้อนหลังกี่วัน

// รหัส อบต. ที่อนุญาตให้ใช้งาน (กันพิมพ์ผิด/สร้าง key มั่ว)
// เพิ่ม อบต. ใหม่ได้โดยเติมรหัสลงในลิสต์นี้
const ALLOWED_ABT = ["lalom", "ltaxmap"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/save" && request.method === "POST") {
      return handleSave(request, env, url);
    }

    if (url.pathname === "/api/load" && request.method === "GET") {
      return handleLoad(request, env, url);
    }

    // ไม่ใช่ API ของเรา -> ส่งต่อให้ Cloudflare เสิร์ฟไฟล์ static ตามปกติ
    return env.ASSETS.fetch(request);
  },
};

/**
 * ตรวจสอบ + คืนค่ารหัส อบต. จาก query string
 * คืนค่า null ถ้าไม่ถูกต้อง (ให้ caller จัดการ error response เอง)
 */
function getAbtCode(url) {
  const abt = url.searchParams.get("abt");
  if (!abt) return null;
  if (!ALLOWED_ABT.includes(abt)) return null;
  return abt;
}

function keyPrefix(abt) {
  return `abt-${abt}:`;
}

/**
 * บันทึกข้อมูล GeoJSON ลง KV (แยกตาม อบต.) + สร้าง backup รายวัน + ลบ backup เก่าเกิน 30 วัน
 */
async function handleSave(request, env, url) {
  const abt = getAbtCode(url);
  if (!abt) {
    return jsonResponse(
      {
        error:
          "ไม่ระบุ อบต. หรือรหัส อบต. ไม่ถูกต้อง กรุณาส่ง ?abt=<รหัส> มาด้วย",
      },
      400
    );
  }

  try {
    const geojson = await request.json();

    if (!geojson || !geojson.features) {
      return jsonResponse({ error: "ข้อมูล GeoJSON ไม่ถูกต้อง" }, 400);
    }

    const dataStr = JSON.stringify(geojson);
    const prefix = keyPrefix(abt);

    // บันทึกข้อมูลหลัก
    await env.PARCEL_KV.put(`${prefix}parcel.geojson`, dataStr);

    // บันทึก backup แยกตามวันที่
    const today = new Date().toISOString().split("T")[0];
    await env.PARCEL_KV.put(`${prefix}backup-${today}.geojson`, dataStr);

    // ลบ backup เก่าที่เกิน RETENTION_DAYS วัน (เฉพาะของ อบต. นี้)
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

      const list = await env.PARCEL_KV.list({ prefix: `${prefix}backup-` });
      for (const key of list.keys) {
        const match = key.name.match(
          new RegExp(`^${prefix}backup-(\\d{4}-\\d{2}-\\d{2})\\.geojson$`)
        );
        if (!match) continue;

        const blobDate = new Date(match[1]);
        if (blobDate < cutoff) {
          await env.PARCEL_KV.delete(key.name);
        }
      }
    } catch (cleanupErr) {
      // ลบ backup เก่าไม่สำเร็จ ไม่ต้องทำให้การบันทึกหลักล้มเหลวไปด้วย
      console.warn("ลบ backup เก่าไม่สำเร็จ:", cleanupErr.message);
    }

    return jsonResponse({
      message: `✅ บันทึกเรียบร้อย (อบต: ${abt})`,
      count: geojson.features.length,
    });
  } catch (err) {
    return jsonResponse({ error: "บันทึกล้มเหลว: " + err.message }, 500);
  }
}

/**
 * โหลดข้อมูล GeoJSON ล่าสุดที่เคยบันทึกไว้กลับมา (แยกตาม อบต.)
 */
async function handleLoad(request, env, url) {
  const abt = getAbtCode(url);
  if (!abt) {
    return jsonResponse(
      {
        error:
          "ไม่ระบุ อบต. หรือรหัส อบต. ไม่ถูกต้อง กรุณาส่ง ?abt=<รหัส> มาด้วย",
      },
      400
    );
  }

  try {
    const prefix = keyPrefix(abt);
    const data = await env.PARCEL_KV.get(`${prefix}parcel.geojson`);

    if (!data) {
      return jsonResponse({ error: "ไม่พบข้อมูล" }, 404);
    }

    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonResponse({ error: "โหลดข้อมูลล้มเหลว: " + err.message }, 500);
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
