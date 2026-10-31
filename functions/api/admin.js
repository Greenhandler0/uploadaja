// POST /api/admin?action=...   (header x-admin-key)
//   check                          cek kunci admin
//   stats[&cursor=]                hitung kiriman/file/ukuran (per batch)
//   delfile&key=msg:..&fid=..      hapus SATU file dari kiriman (teks & file lain tetap)
//   ttl&key=msg:..&days=N[&fid=..] ubah masa simpan; dengan fid = file itu saja, tanpa fid = catatan kiriman. N=0 selamanya
//   orphans[&del=1][&cursor=]      cari/hapus file yatim (file tanpa kiriman)
import { DAY, json, isAdmin, norm, pub, putMsg } from "../_lib/common.js";

const TTL_OK = [1, 7, 30, 90, 365, 0];
const bad = (m, s = 400) => json({ error: m }, s);

export async function onRequestPost({ env, request }) {
  if (!isAdmin(env, request)) return bad("Kunci admin salah.", 401);
  const p = new URL(request.url).searchParams;
  const action = p.get("action") || "check";
  const key = p.get("key") || "";
  const cursor = p.get("cursor") || undefined;

  if (action === "check") return json({ ok: true });

  if (action === "stats") {
    const list = await env.KV.list({ prefix: "msg:", limit: 50, cursor });
    const out = { msgs: 0, files: 0, bytes: 0, forever: 0, once: 0, textOnly: 0 };
    const all = await Promise.all(list.keys.map((k) => env.KV.get(k.name, "json")));
    for (const v of all) {
      if (!v) continue;
      norm(v); out.msgs++;
      const live = v.files.filter((f) => !f.gone);
      if (!v.expiresAt) out.forever++;
      if (v.oneTime && live.length) out.once++;
      if (!v.files.length) out.textOnly++;
      out.files += live.length;
      out.bytes += live.reduce((a, f) => a + (f.size || 0), 0);
    }
    return json({ ok: true, ...out, done: list.list_complete, cursor: list.list_complete ? null : list.cursor });
  }

  if (action === "delfile" || action === "ttl") {
    if (!key.startsWith("msg:")) return bad("Key tidak valid.");
    const fid = p.get("fid") || "";

    if (action === "delfile") {
      const msg = norm(await env.KV.get(key, "json"));
      if (!msg) return bad("Kiriman tidak ditemukan.", 404);
      const i = msg.files.findIndex((f) => f.id === fid && !f.gone);
      if (i < 0) return bad("File tidak ditemukan.", 404);
      await env.KV.delete("file:" + fid);
      const f = msg.files[i];
      msg.files[i] = { id: fid, name: f.name, type: f.type, size: f.size, gone: true, reason: "admin" };
      await putMsg(env, key, msg);
      return json({ ok: true, item: pub(msg, key) });
    }

    const days = Number(p.get("days"));
    if (!TTL_OK.includes(days)) return bad("Masa simpan tidak valid.");
    const opt = days ? { expirationTtl: days * DAY } : {};
    if (fid) { // satu file: tulis ulang dengan masa simpan baru
      const { value, metadata } = await env.KV.getWithMetadata("file:" + fid, "arrayBuffer");
      if (!value) return json({ ok: true, skipped: true });
      await env.KV.put("file:" + fid, value, { ...opt, metadata });
      return json({ ok: true });
    }
    const msg = norm(await env.KV.get(key, "json"));
    if (!msg) return bad("Kiriman tidak ditemukan.", 404);
    msg.expiresAt = days ? Date.now() + days * DAY * 1000 : null;
    await env.KV.put(key, JSON.stringify(msg), opt);
    return json({ ok: true, item: pub(msg, key) });
  }

  if (action === "orphans") {
    const del = p.get("del") === "1";
    const list = await env.KV.list({ prefix: "file:", limit: 40, cursor });
    const cache = new Map();
    let found = 0, deleted = 0;
    for (const k of list.keys) {
      const m = k.metadata || {};
      if (!m.msgKey) continue;
      if (m.at && Date.now() - m.at < 15 * 60 * 1000) continue; // baru diupload, mungkin belum tercatat
      const id = k.name.slice(5);
      if (!cache.has(m.msgKey)) cache.set(m.msgKey, norm(await env.KV.get(m.msgKey, "json")));
      const msg = cache.get(m.msgKey);
      if (msg && msg.files.some((f) => f.id === id && !f.gone)) continue;
      found++;
      if (del) { await env.KV.delete(k.name); deleted++; }
    }
    return json({ ok: true, found, deleted, done: list.list_complete, cursor: list.list_complete ? null : list.cursor });
  }

  return bad("Aksi tidak dikenal.");
}
