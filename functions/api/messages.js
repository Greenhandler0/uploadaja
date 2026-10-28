// GET    /api/messages            -> daftar pesan (terbaru dulu)
// POST   /api/messages            -> kirim pesan (teks + 1 file opsional)
// DELETE /api/messages?key=...    -> hapus pesan (header x-admin-key)
const MAX_FILE = 20 * 1024 * 1024; // 20 MB (batas KV per nilai: 25 MiB)
const MAX_TEXT = 1000000; // karakter (praktis tanpa batas; batas teknis KV 25 MiB per nilai)
const PREVIEW = 2000;     // daftar pesan hanya memuat 2000 karakter pertama; sisanya diambil saat dibuka
const DAY = 86400;
const TTL_DAYS = [1, 7, 30, 0]; // 0 = tanpa batas
const DEFAULT_DAYS = 7;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const isAdmin = (env, req) => !!env.ADMIN_KEY && req.headers.get("x-admin-key") === env.ADMIN_KEY;

const withKey = (v, key, short) => {
  const o = { ...v, key };
  if (short && o.text && o.text.length > PREVIEW) { o.text = o.text.slice(0, PREVIEW); o.truncated = true; }
  return o;
};

export async function onRequestGet({ env, request }) {
  const u = new URL(request.url);
  const one = u.searchParams.get("key");
  if (one) { // satu pesan lengkap (untuk "Selengkapnya" dan "Salin teks")
    if (!one.startsWith("msg:")) return json({ error: "Key tidak valid." }, 400);
    const v = await env.KV.get(one, "json");
    return v ? json(withKey(v, one, false)) : json({ error: "Pesan tidak ditemukan." }, 404);
  }
  const cursor = u.searchParams.get("cursor") || undefined;
  const list = await env.KV.list({ prefix: "msg:", limit: 20, cursor });
  const items = await Promise.all(
    list.keys.map(async (k) => {
      const v = await env.KV.get(k.name, "json");
      return v ? withKey(v, k.name, true) : null;
    })
  );
  return json({ items: items.filter(Boolean), cursor: list.list_complete ? null : list.cursor });
}

export async function onRequestPost({ env, request }) {
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Data tidak valid." }, 400); }

  const name = (form.get("name") || "").toString().trim().slice(0, 60) || "Anonim";
  const text = (form.get("text") || "").toString().trim();
  if (text.length > MAX_TEXT) return json({ error: "Teks terlalu panjang. Maksimal 1.000.000 karakter." }, 413);
  const file = form.get("file");
  const hasFile = file && typeof file === "object" && file.size > 0;
  if (!text && !hasFile) return json({ error: "Tulis teks atau pilih file dulu." }, 400);

  // Opsi 1: kedaluwarsa otomatis
  const raw = form.get("ttl");
  const days = raw !== null && TTL_DAYS.includes(Number(raw)) ? Number(raw) : DEFAULT_DAYS;
  const ttlOpt = days ? { expirationTtl: days * DAY } : {};

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const key = `msg:${String(9999999999999 - createdAt).padStart(13, "0")}:${id}`; // terbaru di atas
  const msg = { id, name, text, createdAt, expiresAt: days ? createdAt + days * DAY * 1000 : null, oneTime: false };

  if (hasFile) {
    if (file.size > MAX_FILE) return json({ error: "File terlalu besar. Maksimal 20 MB." }, 413);
    const type = file.type || "application/octet-stream";
    const oneTime = form.get("oneTime") === "1"; // Opsi 2: hapus setelah diunduh sekali
    await env.KV.put("file:" + id, await file.arrayBuffer(), {
      ...ttlOpt,
      metadata: { type, name: file.name || "file", oneTime, msgKey: key },
    });
    msg.oneTime = oneTime;
    msg.file = { name: file.name || "file", type, size: file.size, url: "/api/file/" + id };
  }

  await env.KV.put(key, JSON.stringify(msg), ttlOpt);
  return json({ ok: true, item: { ...msg, key } }, 201);
}

export async function onRequestDelete({ env, request }) {
  if (!isAdmin(env, request)) return json({ error: "Kunci admin salah." }, 401);
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith("msg:")) return json({ error: "Key tidak valid." }, 400);
  const msg = await env.KV.get(key, "json");
  if (msg && msg.file) await env.KV.delete("file:" + msg.id);
  await env.KV.delete(key);
  return json({ ok: true });
}
