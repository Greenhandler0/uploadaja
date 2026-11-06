// GET    /api/messages                    -> daftar kiriman (terbaru dulu)
// GET    /api/messages?key=msg:...        -> satu kiriman lengkap
// POST   /api/messages                    -> buat kiriman baru (teks + maks. 1 file pertama)
// POST   /api/messages?attach=msg:...     -> tambah file ke kiriman yang sama (butuh token dari POST pertama)
// DELETE /api/messages?key=msg:...        -> hapus kiriman + semua filenya (admin)
import { DAY, json, isAdmin, canViewPrivate, isPrivateMsg, norm, pub, putMsg, expOpt, liveFiles, putFile, delFile, partsOf } from "../_lib/common.js";

const MAX_FILE = 30 * 1024 * 1024; // 30 MB per file (disimpan berpotongan 16 MiB karena batas KV 25 MiB per nilai)
const MAX_FILES = 30;              // file per kiriman
const MAX_TEXT = 1000000;          // karakter
const PUBLIC_DAYS = [1, 7];        // boleh dipilih siapa saja
const ADMIN_DAYS = [1, 7, 30, 0];  // 30 hari & selamanya (0) hanya admin
const DEFAULT_DAYS = 7;
const ATTACH_WINDOW = 2 * 3600 * 1000; // file tambahan hanya diterima 2 jam sejak kiriman dibuat

export async function onRequestGet({ env, request }) {
  const u = new URL(request.url);
  const admin = await canViewPrivate(env, request); // kiriman "Selamanya" hanya terlihat oleh admin
  const one = u.searchParams.get("key");
  if (one) {
    if (!one.startsWith("msg:")) return json({ error: "Key tidak valid." }, 400);
    const v = await env.KV.get(one, "json");
    // Bagi non-admin, kiriman privat dibalas sama seperti "tidak ada" agar keberadaannya tidak bocor.
    return v && (admin || !isPrivateMsg(v)) ? json(pub(v, one, false)) : json({ error: "Pesan tidak ditemukan." }, 404);
  }
  let cursor = u.searchParams.get("cursor") || undefined;
  const items = [];
  let complete = false;
  // Non-admin: kiriman privat dilewati, jadi pindai beberapa batch sampai halaman terisi.
  for (let i = 0; i < 5 && items.length < 20 && !complete; i++) {
    const list = await env.KV.list({ prefix: "msg:", limit: 20, cursor });
    const got = await Promise.all(list.keys.map(async (k) => [k.name, await env.KV.get(k.name, "json")]));
    for (const [name, v] of got) if (v && (admin || !isPrivateMsg(v))) items.push(pub(v, name, true));
    complete = list.list_complete;
    cursor = complete ? undefined : list.cursor;
    if (admin) break; // admin tidak ada yang disaring, satu batch cukup
  }
  return json({ items, cursor: complete ? null : cursor || null });
}

function checkFile(file) {
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") return "File tidak valid.";
  if (file.size > MAX_FILE) return "File terlalu besar. Maksimal 30 MB.";
  return null;
}

export async function onRequestPost({ env, request }) {
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Data tidak valid." }, 400); }
  const attach = new URL(request.url).searchParams.get("attach");
  return attach ? addFile(env, form, attach) : create(env, request, form);
}

async function create(env, request, form) {
  const name = (form.get("name") || "").toString().trim().slice(0, 60) || "Anonim";
  const text = (form.get("text") || "").toString().trim();
  if (text.length > MAX_TEXT) return json({ error: "Teks terlalu panjang. Maksimal 1.000.000 karakter." }, 413);
  const file = form.get("file");
  const hasFile = !!file && typeof file === "object" && typeof file.arrayBuffer === "function";
  if (!text && !hasFile) return json({ error: "Tulis teks atau pilih file dulu." }, 400);
  if (hasFile) { const bad = checkFile(file); if (bad) return json({ error: bad }, 413); }

  // Masa simpan: 30 hari & selamanya hanya untuk admin (dicek di server, bukan cuma di tampilan)
  const raw = form.get("ttl");
  let days = raw !== null && raw !== "" && ADMIN_DAYS.includes(Number(raw)) ? Number(raw) : DEFAULT_DAYS;
  if (!PUBLIC_DAYS.includes(days) && !isAdmin(env, request))
    return json({ error: "Masa simpan 30 hari dan selamanya terkunci, hanya untuk admin." }, 403);

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const key = `msg:${String(9999999999999 - createdAt).padStart(13, "0")}:${id}`; // terbaru di atas
  const oneTime = hasFile && form.get("oneTime") === "1";
  const tok = crypto.randomUUID();
  const msg = { id, name, text, createdAt, expiresAt: days ? createdAt + days * DAY * 1000 : null, oneTime, files: [], tok };

  let fid = null;
  if (hasFile) {
    fid = crypto.randomUUID();
    const type = file.type || "application/octet-stream";
    try { await putFile(env, fid, await file.arrayBuffer(), { type, name: file.name || "file", oneTime, msgKey: key, at: createdAt }, expOpt(msg)); }
    catch { return json({ error: "Gagal menyimpan file." }, 500); }
    msg.files.push({ id: fid, name: file.name || "file", type, size: file.size, url: "/api/file/" + fid });
  }
  try { await env.KV.put(key, JSON.stringify(msg), expOpt(msg)); }
  catch (e) { if (fid) await delFile(env, fid, partsOf(file.size)); return json({ error: "Gagal menyimpan." }, 500); }
  return json({ ok: true, item: pub(msg, key), token: tok }, 201);
}

async function addFile(env, form, key) {
  if (!key.startsWith("msg:")) return json({ error: "Key tidak valid." }, 400);
  const msg = norm(await env.KV.get(key, "json"));
  if (!msg) return json({ error: "Kiriman tidak ditemukan (mungkin sudah dihapus atau kedaluwarsa)." }, 404);
  const tok = (form.get("token") || "").toString();
  if (!msg.tok || tok !== msg.tok) return json({ error: "Token kiriman tidak valid." }, 403);
  if (Date.now() - msg.createdAt > ATTACH_WINDOW) return json({ error: "Waktu menambah file ke kiriman ini sudah habis." }, 403);
  if (msg.files.length >= MAX_FILES) return json({ error: "Maksimal " + MAX_FILES + " file per kiriman." }, 413);
  if (msg.expiresAt && msg.expiresAt - Date.now() < 90000) return json({ error: "Kiriman ini sebentar lagi kedaluwarsa." }, 410);

  const file = form.get("file");
  const bad = checkFile(file);
  if (bad) return json({ error: bad }, 413);

  const fid = crypto.randomUUID();
  const type = file.type || "application/octet-stream";
  try { await putFile(env, fid, await file.arrayBuffer(), { type, name: file.name || "file", oneTime: !!msg.oneTime, msgKey: key, at: Date.now() }, expOpt(msg)); }
  catch { return json({ error: "Gagal menyimpan file." }, 500); }
  msg.files.push({ id: fid, name: file.name || "file", type, size: file.size, url: "/api/file/" + fid });
  let saved = false;
  try { saved = await putMsg(env, key, msg); } catch {}
  if (!saved) { await delFile(env, fid, partsOf(file.size)); return json({ error: "Gagal menambah file ke kiriman." }, 500); }
  return json({ ok: true, item: pub(msg, key) }, 201);
}

export async function onRequestDelete({ env, request }) {
  if (!isAdmin(env, request)) return json({ error: "Kunci admin salah." }, 401);
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith("msg:")) return json({ error: "Key tidak valid." }, 400);
  const msg = await env.KV.get(key, "json");
  if (msg) for (const f of liveFiles(msg)) await delFile(env, f.id, partsOf(f.size));
  await env.KV.delete(key);
  return json({ ok: true });
}
