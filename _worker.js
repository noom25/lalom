/**
 * _worker.js
 * ไฟล์นี้ต้องวางไว้ที่ "root" ของโฟลเดอร์ที่ลากอัปโหลดเข้า Cloudflare
 * (ระดับเดียวกับ index.html)
 *
 * หน้าที่:
 * 1. ถ้า request ตรงกับ /api/save หรือ /api/load -> รันฟังก์ชัน backend ของเรา
 * 2. ถ้าไม่ตรง -> ปล่อยให้ Cloudflare เสิร์ฟไฟล์ static ตามปกติ (index.html, js/, data/ ฯลฯ)
 *
 * ต้องผูก KV Namespace ชื่อ "PARCEL_KV" กับ Worker นี้ก่อนใช้งานได้
 * (วิธีทำอยู่ในคำอธิบายที่ส่งมาพร้อมไฟล์นี้)
 */

const RETENTION_DAYS = 30; // เก็บ backup ย้อนหลังกี่วัน

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/save" && request.method === "POST") {
      return handleSave(request, env);
    }

    if (url.pathname === "/api/load" && request.method === "GET") {
      return handleLoad(request, env);
    }

    // ไม่ใช่ API ของเรา -> ส่งต่อให้ Cloudflare เสิร์ฟไฟล์ static ตามปกติ
    return env.ASSETS.fetch(request);
  },
};

/**
 * บันทึกข้อมูล GeoJSON ลง KV + สร้าง backup รายวัน + ลบ backup เก่าเกิน 30 วัน
 */
async function handleSave(request, env) {
  try {
    const geojson = await request.json();

    if (!geojson || !geojson.features) {
      return jsonResponse({ error: "ข้อมูล GeoJSON ไม่ถูกต้อง" }, 400);
    }

    const dataStr = JSON.stringify(geojson);

    // บันทึกข้อมูลหลัก
    await env.PARCEL_KV.put("parcel.geojson", dataStr);

    // บันทึก backup แยกตามวันที่
    const today = new Date().toISOString().split("T")[0];
    await env.PARCEL_KV.put(`backup-${today}.geojson`, dataStr);

    // ลบ backup เก่าที่เกิน RETENTION_DAYS วัน
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

      const list = await env.PARCEL_KV.list({ prefix: "backup-" });
      for (const key of list.keys) {
        const match = key.name.match(/^backup-(\d{4}-\d{2}-\d{2})\.geojson$/);
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
      message: "✅ บันทึกเรียบร้อย",
      count: geojson.features.length,
    });
  } catch (err) {
    return jsonResponse({ error: "บันทึกล้มเหลว: " + err.message }, 500);
  }
}

/**
 * โหลดข้อมูล GeoJSON ล่าสุดที่เคยบันทึกไว้กลับมา
 */
async function handleLoad(request, env) {
  try {
    const data = await env.PARCEL_KV.get("parcel.geojson");

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
