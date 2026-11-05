// GET  /api/folders[?folder=ID]  publik: daftar folder / isi folder
// POST /api/folders?action=...   (header x-admin-key; semua aksi pengelolaan khusus admin)
//   list                              daftar folder (daftar datar: id, name, parent)
//   create&name=&parent=              buat folder (parent kosong = akar)
//   rename&id=&name=                  ubah nama folder
//   movefolder&id=&parent=            pindahkan folder ke folder lain (dicegah masuk ke dirinya/turunannya)
//   delete&id=                        hapus folder; subfolder naik satu tingkat, file kembali ke "tanpa folder" (file TIDAK dihapus)
//   move&key=msg:..&fids=a,b[&text=1]&folder=  pindahkan file (dan/atau teks) satu kiriman ke folder (folder kosong = akar)
//   contents&folder=[&cursor=]        file di folder itu (folder kosong = file yang belum masuk folder), dipindai per batch
// Folder disimpan di satu key KV "folders"; keanggotaan file disimpan di msg.files[i].folder.
import { json, isAdmin, norm, pub, putMsg } from "../_lib/common.js";

const bad = (m, s = 400) => json({ error: m }, s);
const MAX_FOLDERS = 500;

// File dalam satu folder (folder kosong = file yang belum masuk folder), dipindai per batch 50 kiriman.
async function contents(env, fs, folder, cursor) {
  const has = (id) => fs.some((f) => f.id === id);
  const list = await env.KV.list({ prefix: "msg:", limit: 50, cursor });
  const all = await Promise.all(list.keys.map(async (k) => [k.name, await env.KV.get(k.name, "json")]));
  const files = [];
  for (const [key, v] of all) {
    if (!v) continue;
    norm(v);
    for (const f of v.files) {
      if (f.gone) continue;
      if ((f.folder && has(f.folder) ? f.folder : "") !== folder) continue;
      files.push({ key, from: v.name, createdAt: v.createdAt, expiresAt: v.expiresAt, oneTime: !!v.oneTime, file: f });
    }
    // Teks kiriman juga bisa masuk folder (tfolder); dikirim berupa cuplikan 2000 karakter.
    if (v.text && (v.tfolder && has(v.tfolder) ? v.tfolder : "") === folder) {
      files.push({ key, from: v.name, createdAt: v.createdAt, expiresAt: v.expiresAt, oneTime: !!v.oneTime, text: v.text.slice(0, 2000), truncated: v.text.length > 2000 });
    }
  }
  return json({ ok: true, files, done: list.list_complete, cursor: list.list_complete ? null : list.cursor });
}

// GET publik (tanpa kunci): daftar folder, dan isi satu folder (?folder=ID[&cursor=]). Pengelolaan tetap khusus admin (POST).
export async function onRequestGet({ env, request }) {
  const p = new URL(request.url).searchParams;
  const fs = (await env.KV.get("folders", "json")) || [];
  const folder = p.get("folder") || "";
  if (!folder) return json({ ok: true, folders: fs });
  if (!fs.some((f) => f.id === folder)) return bad("Folder tidak ditemukan.", 404);
  return contents(env, fs, folder, p.get("cursor") || undefined);
}

export async function onRequestPost({ env, request }) {
  if (!isAdmin(env, request)) return bad("Kunci admin salah.", 401);
  const p = new URL(request.url).searchParams;
  const action = p.get("action") || "list";
  let fs = (await env.KV.get("folders", "json")) || [];
  const has = (id) => !id || fs.some((f) => f.id === id);
  const save = () => env.KV.put("folders", JSON.stringify(fs));
  const name = (p.get("name") || "").trim().slice(0, 60);
  const dup = (nm, parent, self) => fs.some((f) => f.id !== self && f.parent === parent && f.name.toLowerCase() === nm.toLowerCase());
  const under = (id, anc) => { for (let f = fs.find((x) => x.id === id), n = 0; f && n < 100; f = fs.find((x) => x.id === f.parent), n++) if (f.id === anc) return true; return false; };

  if (action === "list") return json({ ok: true, folders: fs });

  if (action === "create") {
    const parent = p.get("parent") || "";
    if (!name) return bad("Nama folder kosong.");
    if (!has(parent)) return bad("Folder induk tidak ada.", 404);
    if (fs.length >= MAX_FOLDERS) return bad("Maksimal " + MAX_FOLDERS + " folder.");
    if (dup(name, parent)) return bad("Nama folder sudah dipakai di sini.");
    fs.push({ id: crypto.randomUUID().slice(0, 8), name, parent });
    await save();
    return json({ ok: true, folders: fs });
  }

  if (action === "rename" || action === "movefolder" || action === "delete") {
    const f = fs.find((x) => x.id === p.get("id"));
    if (!f) return bad("Folder tidak ditemukan.", 404);
    if (action === "rename") {
      if (!name) return bad("Nama folder kosong.");
      if (dup(name, f.parent, f.id)) return bad("Nama folder sudah dipakai di sini.");
      f.name = name;
    } else if (action === "movefolder") {
      const parent = p.get("parent") || "";
      if (!has(parent)) return bad("Folder tujuan tidak ada.", 404);
      if (parent === f.id || under(parent, f.id)) return bad("Folder tidak bisa dipindah ke dalam dirinya sendiri.");
      if (dup(f.name, parent, f.id)) return bad("Di folder tujuan sudah ada folder bernama sama.");
      f.parent = parent;
    } else {
      fs.forEach((x) => { if (x.parent === f.id) x.parent = f.parent; });
      fs = fs.filter((x) => x.id !== f.id);
    }
    await save();
    return json({ ok: true, folders: fs });
  }

  if (action === "move") {
    const key = p.get("key") || "", folder = p.get("folder") || "";
    const fids = (p.get("fids") || "").split(",").filter(Boolean);
    const withText = p.get("text") === "1"; // pindahkan juga teks kiriman (msg.tfolder)
    if (!key.startsWith("msg:") || (!fids.length && !withText)) return bad("Permintaan tidak valid.");
    if (!has(folder)) return bad("Folder tujuan tidak ada.", 404);
    const msg = norm(await env.KV.get(key, "json"));
    if (!msg) return bad("Kiriman tidak ditemukan.", 404);
    let n = 0;
    for (const f of msg.files) {
      if (f.gone || !fids.includes(f.id)) continue;
      if (folder) f.folder = folder; else delete f.folder;
      n++;
    }
    if (withText && msg.text) { if (folder) msg.tfolder = folder; else delete msg.tfolder; n++; }
    if (!n) return bad("Item tidak ditemukan.", 404);
    if (!(await putMsg(env, key, msg))) return bad("Kiriman sebentar lagi kedaluwarsa, tidak bisa diubah.", 410);
    return json({ ok: true, moved: n, item: pub(msg, key) });
  }

  if (action === "contents") return contents(env, fs, p.get("folder") || "", p.get("cursor") || undefined);

  return bad("Aksi tidak dikenal.");
}
