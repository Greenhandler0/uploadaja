// Pintasan website buatan admin, KHUSUS ADMIN (dicek di server, bukan hanya disembunyikan di tampilan).
// GET  /api/shortcuts                 header x-admin-key ATAU cookie sesi admin; non-admin dibalas 404
// POST /api/shortcuts?action=...      header x-admin-key
//   add&name=&url=[&icon=]            tambah pintasan (url tanpa http(s):// otomatis diberi https://)
//   edit&id=&name=&url=[&icon=]       ubah pintasan
//   delete&id=                        hapus pintasan
//   move&id=&dir=up|down              geser urutan
// Disimpan di satu key KV "shortcuts": [{ id, name, url, icon? }]
import { json, isAdmin, canViewPrivate } from "../_lib/common.js";

const bad = (m, s = 400) => json({ error: m }, s);
const MAX_ITEMS = 60;

// Terima hanya http/https. Kembalikan URL bersih, atau "" jika tidak valid.
function cleanUrl(raw) {
  let u = (raw || "").trim().slice(0, 500);
  if (!u) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && x.protocol !== "http:") return "";
    if (!x.hostname.includes(".") && x.hostname !== "localhost") return "";
    return x.toString();
  } catch { return ""; }
}

// Ikon opsional: satu emoji/karakter pendek. Dibatasi 4 karakter agar tidak dipakai menyimpan teks panjang.
const cleanIcon = (s) => Array.from((s || "").trim()).slice(0, 2).join("");

export async function onRequestGet({ env, request }) {
  if (!(await canViewPrivate(env, request))) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const items = (await env.KV.get("shortcuts", "json")) || [];
  return json({ ok: true, items });
}

export async function onRequestPost({ env, request }) {
  if (!isAdmin(env, request)) return bad("Kunci admin salah.", 401);
  const p = new URL(request.url).searchParams;
  const action = p.get("action") || "";
  let items = (await env.KV.get("shortcuts", "json")) || [];
  const save = () => env.KV.put("shortcuts", JSON.stringify(items));
  const name = (p.get("name") || "").trim().slice(0, 60);

  if (action === "add" || action === "edit") {
    const url = cleanUrl(p.get("url"));
    if (!name) return bad("Nama website kosong.");
    if (!url) return bad("Alamat website tidak valid. Contoh: https://contoh.com");
    const icon = cleanIcon(p.get("icon"));
    if (action === "add") {
      if (items.length >= MAX_ITEMS) return bad("Maksimal " + MAX_ITEMS + " pintasan.");
      const it = { id: crypto.randomUUID().slice(0, 8), name, url };
      if (icon) it.icon = icon;
      items.push(it);
    } else {
      const it = items.find((x) => x.id === p.get("id"));
      if (!it) return bad("Pintasan tidak ditemukan.", 404);
      it.name = name; it.url = url;
      if (icon) it.icon = icon; else delete it.icon;
    }
    await save();
    return json({ ok: true, items });
  }

  if (action === "delete" || action === "move") {
    const i = items.findIndex((x) => x.id === p.get("id"));
    if (i < 0) return bad("Pintasan tidak ditemukan.", 404);
    if (action === "delete") items.splice(i, 1);
    else {
      const j = p.get("dir") === "up" ? i - 1 : i + 1;
      if (j >= 0 && j < items.length) [items[i], items[j]] = [items[j], items[i]];
    }
    await save();
    return json({ ok: true, items });
  }

  return bad("Aksi tidak dikenal.");
}
