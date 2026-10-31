// POST /api/cleanup?days=30&scope=files|all[&cursor=...]   (header x-admin-key)
// POST /api/cleanup?check=1                                (cek kunci admin)
// days=0 + scope=all  -> hapus SEMUA kiriman.
// Diproses per batch kecil; ulangi dengan "cursor" sampai selesai.
import { DAY, json, isAdmin, norm, liveFiles, putMsg } from "../_lib/common.js";

export async function onRequestPost({ env, request }) {
  if (!isAdmin(env, request)) return json({ error: "Kunci admin salah." }, 401);

  const p = new URL(request.url).searchParams;
  if (p.get("check")) return json({ ok: true });

  const d = parseInt(p.get("days") || "30", 10);
  const days = Number.isNaN(d) ? 30 : Math.max(0, d);
  const scope = p.get("scope") === "all" ? "all" : "files";
  const cutoff = Date.now() - days * DAY * 1000;
  const threshold = String(9999999999999 - cutoff).padStart(13, "0"); // lebih besar = lebih lama

  let cursor = p.get("cursor") || undefined;
  let ops = 0, filesDeleted = 0, msgsDeleted = 0, done = false;

  while (ops < 30) {
    const list = await env.KV.list({ prefix: "msg:", limit: 10, cursor });
    ops++;
    for (const k of list.keys) {
      if (k.name.slice(4, 17) < threshold) continue; // pesan lebih baru dari batas
      const msg = norm(await env.KV.get(k.name, "json")); ops++;
      if (!msg) continue;
      const live = liveFiles(msg);
      if (scope === "all") {
        for (const f of live) { await env.KV.delete("file:" + f.id); ops++; filesDeleted++; }
        await env.KV.delete(k.name); ops++; msgsDeleted++;
      } else if (live.length) {
        for (const f of live) { await env.KV.delete("file:" + f.id); ops++; filesDeleted++; }
        msg.files = msg.files.map((f) => f.gone ? f : { id: f.id, name: f.name, type: f.type, size: f.size, gone: true, reason: "cleanup" });
        await putMsg(env, k.name, msg); ops++;
      }
    }
    if (list.list_complete) { done = true; cursor = null; break; }
    cursor = list.cursor;
  }
  return json({ ok: true, done, cursor: done ? null : cursor, filesDeleted, msgsDeleted });
}
