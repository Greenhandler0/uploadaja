// Helper bersama untuk semua endpoint (bukan route).
export const DAY = 86400;

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const isAdmin = (env, req) => !!env.ADMIN_KEY && req.headers.get("x-admin-key") === env.ADMIN_KEY;

// Data lama menyimpan satu file di msg.file. Ubah ke msg.files (array) agar semua kode seragam.
export function norm(msg) {
  if (!msg) return msg;
  if (!Array.isArray(msg.files)) msg.files = msg.file ? [{ ...msg.file, id: msg.id }] : [];
  delete msg.file;
  return msg;
}

// Bentuk yang aman dikirim ke browser (token upload tidak ikut).
export function pub(msg, key, short, preview = 2000) {
  const o = { ...norm(msg), key };
  delete o.tok;
  if (short && o.text && o.text.length > preview) { o.text = o.text.slice(0, preview); o.truncated = true; }
  return o;
}

// Opsi kedaluwarsa KV mengikuti expiresAt pesan (null = tanpa batas).
export const expOpt = (msg) => (msg.expiresAt ? { expiration: Math.floor(msg.expiresAt / 1000) } : {});

// Simpan ulang pesan tanpa mengubah masa simpannya. false = sebentar lagi kedaluwarsa, dilewati.
export async function putMsg(env, key, msg) {
  if (msg.expiresAt && msg.expiresAt - Date.now() < 90000) return false;
  await env.KV.put(key, JSON.stringify(msg), expOpt(msg));
  return true;
}

export const liveFiles = (msg) => (norm(msg).files || []).filter((f) => !f.gone);

// File besar dipecah: KV membatasi 25 MiB per nilai. Potongan 1 di "file:ID" (membawa metadata),
// potongan berikutnya di "fpart:ID:n". File lama (satu nilai) tetap terbaca (parts tidak ada = 1).
export const CHUNK = 16 * 1024 * 1024;
export const partsOf = (size) => Math.max(1, Math.ceil((size || 0) / CHUNK));

export async function delFile(env, id, parts = 1) {
  await env.KV.delete("file:" + id);
  for (let i = 1; i < parts; i++) await env.KV.delete(`fpart:${id}:${i}`);
}

// opt = { expiration } / { expirationTtl } / {}. Kepala ditulis dulu agar upload terputus terdeteksi sebagai file yatim.
export async function putFile(env, id, buf, meta, opt) {
  const parts = partsOf(buf.byteLength);
  try {
    await env.KV.put("file:" + id, parts > 1 ? buf.slice(0, CHUNK) : buf, { ...opt, metadata: { ...meta, parts } });
    for (let i = 1; i < parts; i++) await env.KV.put(`fpart:${id}:${i}`, buf.slice(i * CHUNK, (i + 1) * CHUNK), opt);
  } catch (e) { await delFile(env, id, parts); throw e; }
}

export async function getFile(env, id) {
  const { value, metadata } = await env.KV.getWithMetadata("file:" + id, "arrayBuffer");
  if (!value) return {};
  const parts = (metadata && metadata.parts) || 1;
  if (parts === 1) return { value, metadata };
  const bufs = [value];
  for (let i = 1; i < parts; i++) {
    const b = await env.KV.get(`fpart:${id}:${i}`, "arrayBuffer");
    if (!b) return {};
    bufs.push(b);
  }
  const out = new Uint8Array(bufs.reduce((a, b) => a + b.byteLength, 0));
  let o = 0;
  for (const b of bufs) { out.set(new Uint8Array(b), o); o += b.byteLength; }
  return { value: out.buffer, metadata };
}
