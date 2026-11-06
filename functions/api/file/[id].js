// GET /api/file/:id
// - File biasa: tampil/unduh, mendukung Range untuk video/audio
// - File "sekali unduh": hanya lewat ?dl=1, lalu otomatis dihapus dari KV
import { norm, putMsg, getFile, delFile, canViewPrivate, isPrivateMsg } from "../../_lib/common.js";

const INLINE = /^(image\/(?!svg)|video\/|audio\/)|^application\/pdf$/;

async function consume(env, id, meta) {
  await delFile(env, id, (meta && meta.parts) || 1);
  if (!meta || !meta.msgKey) return;
  const msg = norm(await env.KV.get(meta.msgKey, "json"));
  if (!msg) return;
  const i = msg.files.findIndex((f) => f.id === id);
  if (i < 0) return;
  const f = msg.files[i];
  msg.files[i] = { id, name: f.name, type: f.type, size: f.size, gone: true, reason: "downloaded" };
  await putMsg(env, meta.msgKey, msg);
}

export async function onRequestGet({ env, params, request, waitUntil }) {
  const { value, metadata } = await getFile(env, params.id);
  if (!value) return new Response("File tidak ditemukan atau sudah dihapus.", { status: 404 });

  // File dari kiriman "Selamanya" bersifat privat: hanya admin. Non-admin dibalas 404 (sama seperti file tidak ada).
  // File tanpa kiriman induk (yatim) juga hanya untuk admin. File lama tanpa msgKey tidak bisa dicek (dianggap publik).
  const NOT_FOUND = () => new Response("File tidak ditemukan atau sudah dihapus.", { status: 404, headers: { "cache-control": "no-store" } });
  let priv = false;
  if (metadata && metadata.msgKey) {
    const msg = await env.KV.get(metadata.msgKey, "json");
    priv = !msg || isPrivateMsg(msg);
  }
  if (priv && !(await canViewPrivate(env, request))) return NOT_FOUND();

  const type = (metadata && metadata.type) || "application/octet-stream";
  const name = (metadata && metadata.name) || "file";
  const disp = (kind) => `${kind}; filename*=UTF-8''${encodeURIComponent(name)}`;
  const total = value.byteLength;

  if (metadata && metadata.oneTime) {
    const url = new URL(request.url);
    if (url.searchParams.get("dl") !== "1" || request.headers.get("range"))
      return new Response("File ini hanya bisa diunduh sekali lewat tombol Unduh.", { status: 403 });
    waitUntil(consume(env, params.id, metadata));
    return new Response(value, {
      headers: {
        "content-type": type,
        "content-disposition": disp("attachment"),
        "content-length": String(total),
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  }

  const headers = {
    "content-type": type,
    "content-disposition": disp(INLINE.test(type) ? "inline" : "attachment"),
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    "cache-control": priv ? "private, no-store" : "public, max-age=3600",
  };
  const range = request.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (!m[1] && m[2]) { start = total - parseInt(m[2], 10); end = total - 1; }
    end = Math.min(end, total - 1);
    if (start > end || start < 0)
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    return new Response(value.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(value, { headers: { ...headers, "content-length": String(total) } });
}
