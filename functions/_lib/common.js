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
