// POST /api/cleanup?days=30&scope=files|all[&cursor=...]   (header x-admin-key)
// POST /api/cleanup?check=1                                (cek kunci admin)
// Opsi 3: hapus file lama. Diproses per batch; ulangi dengan "cursor" sampai selesai.
const DAY = 86400;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function onRequestPost({ env, request }) {
  if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY)
    return json({ error: "Kunci admin salah." }, 401);

  const p = new URL(request.url).searchParams;
  if (p.get("check")) return json({ ok: true });

  const days = Math.max(1, parseInt(p.get("days") || "30", 10) || 30);
  const scope = p.get("scope") === "all" ? "all" : "files";
  const cutoff = Date.now() - days * DAY * 1000;
  const threshold = String(9999999999999 - cutoff).padStart(13, "0"); // lebih besar = lebih lama

  let cursor = p.get("cursor") || undefined;
  let ops = 0, filesDeleted = 0, msgsDeleted = 0, done = false;

  while (ops < 200) {
    const list = await env.KV.list({ prefix: "msg:", limit: 100, cursor });
    ops++;
    for (const k of list.keys) {
      if (k.name.slice(4, 17) <= threshold) continue; // pesan lebih baru dari batas
      const msg = await env.KV.get(k.name, "json"); ops++;
      if (!msg) continue;
      const hasFile = msg.file && !msg.file.gone;
      if (scope === "all") {
        if (hasFile) { await env.KV.delete("file:" + msg.id); ops++; filesDeleted++; }
        await env.KV.delete(k.name); ops++; msgsDeleted++;
      } else if (hasFile) {
        await env.KV.delete("file:" + msg.id); ops++; filesDeleted++;
        msg.file = { name: msg.file.name, type: msg.file.type, size: msg.file.size, gone: true, reason: "cleanup" };
        const opt = {};
        if (msg.expiresAt) {
          if (msg.expiresAt - Date.now() < 90000) continue;
          opt.expiration = Math.floor(msg.expiresAt / 1000);
        }
        await env.KV.put(k.name, JSON.stringify(msg), opt); ops++;
      }
    }
    if (list.list_complete) { done = true; cursor = null; break; }
    cursor = list.cursor;
  }
  return json({ ok: true, done, cursor: done ? null : cursor, filesDeleted, msgsDeleted });
}
