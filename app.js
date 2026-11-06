const MAX = 30 * 1024 * 1024;
const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const MAX_FILES = 30;
let cursor = null, files = [], busy = false, adminKey = "", tt, shown = 0, cur = null;
const selected = new Set();
try { adminKey = sessionStorage.getItem("adminKey") || ""; } catch {}
try { $("name").value = localStorage.getItem("nama") || ""; } catch {}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function ico(name, small) { const s = document.createElementNS(NS, "svg"); s.setAttribute("class", "i" + (small ? " sm" : "")); s.setAttribute("aria-hidden", "true"); const u = document.createElementNS(NS, "use"); u.setAttribute("href", "#i-" + name); s.appendChild(u); return s; }
const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
const fmtDate = (t) => new Date(t).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
const extOf = (n) => { const i = n.lastIndexOf("."); return i > 0 && i < n.length - 1 ? n.slice(i + 1, i + 5).toUpperCase() : "FILE"; };
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "baru saja";
  if (s < 3600) return Math.floor(s / 60) + " menit lalu";
  if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
  return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
function left(ms) {
  if (ms <= 0) return "kedaluwarsa";
  if (ms >= 2 * 86400000) return Math.round(ms / 86400000) + " hari lagi";
  if (ms >= 3600000) return Math.round(ms / 3600000) + " jam lagi";
  return "sebentar lagi";
}
function toast(msg, err) { const t = $("toast"); t.textContent = msg; t.className = "show" + (err ? " err" : ""); clearTimeout(tt); tt = setTimeout(() => t.className = "", 3500); }
function setBtn(b, icon, text) { b.textContent = ""; b.append(ico(icon, true), text); }
function setMsg(id, msg, err) { const s = $(id); s.textContent = msg || ""; s.className = "msg" + (err ? " err" : ""); }
function saveBlob(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}

// ---- Tema ----
const THEMES = [
  ["samudra", "Samudra", "#2A44CC", "#4A6CF0"],
  ["zamrud", "Zamrud", "#0A7355", "#14A37A"],
  ["anggur", "Anggur", "#6531CC", "#9A5CF0"],
  ["senja", "Senja", "#B83A0A", "#F08A2C"],
  ["grafit", "Grafit", "#1F2937", "#5B6B82"],
];
const mq = matchMedia("(prefers-color-scheme: dark)");
let theme = document.documentElement.dataset.theme, mode = "auto";
try { mode = localStorage.getItem("mode") || "auto"; } catch {}
function applyTheme() {
  const dark = mode === "dark" || (mode === "auto" && mq.matches), r = document.documentElement;
  r.dataset.theme = theme; r.dataset.mode = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content = dark ? "#141B26" : "#FFFFFF";
  document.querySelectorAll(".sw").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.theme === theme)));
  document.querySelectorAll("#modes button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
}
THEMES.forEach(([id, label, c1, c2]) => {
  const b = el("button", "sw"); b.type = "button"; b.dataset.theme = id;
  const dot = el("i"); dot.style.background = `linear-gradient(135deg,${c1},${c2})`;
  b.append(dot, label);
  b.addEventListener("click", () => { theme = id; try { localStorage.setItem("theme", id); } catch {} applyTheme(); });
  $("themes").appendChild(b);
});
document.querySelectorAll("#modes button").forEach(b => b.addEventListener("click", () => { mode = b.dataset.mode; try { localStorage.setItem("mode", mode); } catch {} applyTheme(); }));
mq.addEventListener("change", applyTheme);
const tdlg = $("tdlg");
$("themeBtn").addEventListener("click", () => tdlg.showModal());
$("tclose").addEventListener("click", () => tdlg.close());
tdlg.addEventListener("click", (e) => { if (e.target === tdlg) tdlg.close(); });
applyTheme();

// ---- Komposer ----
const ta = $("text");
ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 220) + "px"; });

const fkey = (f) => f.name + "|" + f.size + "|" + f.lastModified;
function refreshUI() {
  const n = files.length, ok = files.filter(x => x.state !== "done");
  $("chips").hidden = !n; $("chipsum").hidden = !n;
  $("once").disabled = !n; $("onceBox").classList.toggle("off", !n);
  if (!n) $("once").checked = false;
  const total = files.reduce((a, x) => a + x.file.size, 0);
  $("sumT").textContent = n + " file dipilih · " + fmtSize(total);
  $("dropT").textContent = n ? "Tambah file lagi" : "Pilih atau seret file";
  $("sendlbl").textContent = busy ? "Mengupload..." : (n ? "Upload " + n + " file" : "Upload");
  $("clearAll").disabled = busy;
}
function chipFor(x) {
  const c = el("div", "chip"); x.node = c;
  const th = el("div", "thumb");
  const f = x.file;
  if (/^image\//.test(f.type) && !/svg/.test(f.type)) {
    x.url = URL.createObjectURL(f);
    const im = document.createElement("img"); im.src = x.url; im.alt = ""; th.appendChild(im);
  } else th.appendChild(ico(/^video\//.test(f.type) ? "play" : "file"));
  const info = el("div", "info"); info.append(el("b", "", f.name), el("span", "", fmtSize(f.size)));
  x.sub = info.lastChild;
  x.st = el("span", "st");
  const rm = el("button", "btn ghost icon"); rm.type = "button"; rm.setAttribute("aria-label", "Lepas " + f.name); rm.appendChild(ico("x"));
  rm.addEventListener("click", () => { if (!busy) removeFile(x); });
  c.append(th, info, x.st, rm);
  return c;
}
function removeFile(x) {
  if (x.url) URL.revokeObjectURL(x.url);
  if (x.node) x.node.remove();
  files = files.filter(y => y !== x);
  if (!files.length) { $("file").value = ""; cur = null; }
  refreshUI();
}
function addFiles(list) {
  if (busy) return;
  const seen = new Set(files.map(x => fkey(x.file)));
  let big = 0, dup = 0, over = 0;
  for (const f of Array.from(list || [])) {
    if (f.size > MAX) { big++; continue; }
    if (seen.has(fkey(f))) { dup++; continue; }
    if (files.length >= MAX_FILES) { over++; continue; }
    seen.add(fkey(f));
    const x = { file: f, state: "wait" };
    files.push(x); $("chips").appendChild(chipFor(x));
  }
  const w = [];
  if (big) w.push(big + " file lebih dari 30 MB dilewati");
  if (over) w.push(over + " file melebihi batas " + MAX_FILES + " file per upload");
  if (dup) w.push(dup + " file sama dilewati");
  if (w.length) toast(w.join(". ") + ".", true);
  $("file").value = "";
  refreshUI();
}
function clearAll() { if (busy) return; files.slice().forEach(x => { if (x.url) URL.revokeObjectURL(x.url); }); files = []; cur = null; $("chips").textContent = ""; $("file").value = ""; refreshUI(); }
$("file").addEventListener("change", () => addFiles($("file").files));
$("clearAll").addEventListener("click", clearAll);

const box = $("compose");
["dragenter", "dragover"].forEach(e => box.addEventListener(e, ev => { ev.preventDefault(); box.classList.add("over"); }));
["dragleave", "drop"].forEach(e => box.addEventListener(e, ev => { ev.preventDefault(); box.classList.remove("over"); }));
box.addEventListener("drop", ev => {
  const dt = ev.dataTransfer; if (!dt || !dt.files.length) return;
  const it = Array.from(dt.items || []), isDir = (i) => { const e = it[i] && it[i].webkitGetAsEntry && it[i].webkitGetAsEntry(); return !!(e && e.isDirectory); };
  const fl = Array.from(dt.files).filter((f, i) => !isDir(i));
  if (fl.length < dt.files.length) toast("Folder dari komputer tidak bisa diunggah langsung. Jadikan .zip atau pilih file di dalamnya.", true);
  if (fl.length) addFiles(fl);
});
ta.addEventListener("paste", ev => { const fl = ev.clipboardData && ev.clipboardData.files; if (fl && fl.length) { ev.preventDefault(); addFiles(fl); } });
refreshUI();

// ---- Daftar kiriman ----
const pending = [];
function fitClamps() { requestAnimationFrame(() => { while (pending.length) pending.shift()(); }); }
function updateCount() { applyFilter(); }
async function copyText(t) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); return; } } catch {}
  const a = document.createElement("textarea"); a.value = t; a.style.cssText = "position:fixed;opacity:0;top:0;left:0";
  document.body.appendChild(a); a.select();
  const ok = document.execCommand("copy"); a.remove();
  if (!ok) throw new Error("copy");
}
function avatar(name) {
  const d = el("div", "av", (name.trim()[0] || "?").toUpperCase());
  const h = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  d.style.background = `hsl(${Math.abs(h) % 360} 42% 38%)`;
  return d;
}
function life(m) {
  const s = el("span", "life"); s.appendChild(ico("clock", true));
  if (!m.expiresAt) { s.append("Tanpa batas"); return s; }
  const total = m.expiresAt - m.createdAt, rem = m.expiresAt - Date.now();
  s.append(left(rem));
  const mt = el("i", "meter"), b = document.createElement("b");
  b.style.width = Math.round(Math.max(0, Math.min(1, rem / total)) * 100) + "%";
  mt.appendChild(b); s.appendChild(mt);
  if (rem < 86400000) s.classList.add("soon");
  s.title = "Dihapus otomatis " + fmtDate(m.expiresAt);
  return s;
}
function goneBox(text) { const g = el("div", "gone"); g.appendChild(ico("trash", true)); g.append(text); return g; }

const INL = /^(image\/(?!svg)|video\/|audio\/)|^application\/pdf$/;
const isImg = (t) => /^image\//.test(t) && !/svg/.test(t);
const goneText = (f) => (f.reason === "cleanup" || f.reason === "admin" ? "Dihapus admin: " : "Sudah diunduh dan dihapus: ") + f.name;

function fileBar(m, f, row, att, single) {
  const bar = el("div", "fbar");
  const sub = fmtSize(f.size) + (m.oneTime ? " · hanya bisa diunduh sekali" : "");
  const info = el("span", "t"); info.append(el("b", "", f.name), el("span", "", sub));
  let lead;
  if (!single && !m.oneTime && isImg(f.type)) {
    lead = el("a", "badge th"); lead.href = f.url; lead.target = "_blank"; lead.rel = "noopener"; lead.setAttribute("aria-label", "Buka " + f.name);
    const im = document.createElement("img"); im.src = f.url; im.loading = "lazy"; im.alt = ""; lead.appendChild(im);
  } else lead = el("span", "badge", extOf(f.name));
  bar.append(lead, info);

  if (!m.oneTime && INL.test(f.type)) {
    const op = el("a", "btn ghost icon"); op.href = f.url; op.target = "_blank"; op.rel = "noopener"; op.title = "Buka di tab baru"; op.setAttribute("aria-label", "Buka " + f.name);
    op.appendChild(ico("open", true)); bar.appendChild(op);
  }
  if (adminKey) {
    const x = el("button", "btn ghost icon"); x.type = "button"; x.title = "Hapus file ini saja"; x.setAttribute("aria-label", "Hapus file " + f.name);
    x.appendChild(ico("trash", true)); x.addEventListener("click", () => delFile(m, f, row));
    const mv = el("button", "btn ghost icon"); mv.type = "button"; mv.title = "Pindahkan ke folder"; mv.setAttribute("aria-label", "Pindahkan " + f.name + " ke folder");
    mv.appendChild(ico("folder", true)); mv.addEventListener("click", () => moveOne(m, f, row)); bar.append(mv, x);
  }
  const dl = el("a", "btn dl"); dl.href = m.oneTime ? f.url + "?dl=1" : f.url; dl.setAttribute("download", f.name);
  dl.setAttribute("aria-label", "Download " + f.name); dl.append(ico("down", true), "Download");
  if (m.oneTime) dl.addEventListener("click", () => setTimeout(() => (single ? att : bar).replaceWith(goneBox("Sudah diunduh dan dihapus: " + f.name)), 2000));
  bar.appendChild(dl);
  return bar;
}

async function delFile(m, f, row) {
  if (!confirm('Hapus file "' + f.name + '" dari kiriman ini? Teks dan file lain tetap ada.')) return;
  const r = await adminApi("delfile", { key: m.key, fid: f.id });
  if (r.ok) { putRow(r.d.item, row); toast("File dihapus."); } else toast(r.d.error || "Gagal menghapus file.", true);
}

// ---- ZIP sederhana (tanpa kompresi) untuk "Unduh semua" ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(entries) {
  const enc = new TextEncoder(), parts = [], central = [];
  const d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  let offset = 0;
  for (const e of entries) {
    const nm = enc.encode(e.name), crc = crc32(e.data), sz = e.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true);
    parts.push(lh.buffer, nm, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
    central.push(ch.buffer, nm);
    offset += 30 + nm.length + sz;
  }
  let csize = 0; central.forEach(b => csize += b.byteLength);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}
async function zipAll(m, btn) {
  const live = m.files.filter(f => !f.gone), total = live.reduce((a, f) => a + f.size, 0);
  if (total > 250 * 1048576) { toast("Total lebih dari 250 MB. Unduh per file saja.", true); return; }
  btn.disabled = true;
  const names = new Set(), entries = [];
  try {
    for (let i = 0; i < live.length; i++) {
      setBtn(btn, "down", "Menyiapkan " + (i + 1) + "/" + live.length);
      const r = await fetch(live[i].url); if (!r.ok) throw new Error("fetch");
      const data = new Uint8Array(await r.arrayBuffer());
      const base = live[i].name.replace(/[\\/:*?"<>|]/g, "_"); let n = base, k = 2;
      while (names.has(n.toLowerCase())) { const dot = base.lastIndexOf("."); n = dot > 0 ? base.slice(0, dot) + " (" + k + ")" + base.slice(dot) : base + " (" + k + ")"; k++; }
      names.add(n.toLowerCase()); entries.push({ name: n, data });
    }
    saveBlob(makeZip(entries), "upload-aja-" + new Date(m.createdAt).toISOString().slice(0, 10) + ".zip");
  } catch { toast("Gagal menyiapkan ZIP. Coba unduh per file.", true); }
  setBtn(btn, "down", "Unduh semua (.zip)"); btn.disabled = false;
}

function attachments(m, body, row) {
  const fs = m.files, live = fs.filter(f => !f.gone);
  if (fs.length === 1) {
    const f = fs[0];
    if (f.gone) { body.appendChild(goneBox(goneText(f))); return; }
    const att = el("div", "att"), t = f.type;
    if (!m.oneTime) {
      if (isImg(t)) {
        const pv = el("div", "pv"), a = el("a"); a.href = f.url; a.target = "_blank"; a.rel = "noopener";
        const i = document.createElement("img"); i.src = f.url; i.loading = "lazy"; i.alt = f.name; a.appendChild(i); pv.appendChild(a); att.appendChild(pv);
      } else if (/^video\//.test(t)) {
        const pv = el("div", "pv"), v = document.createElement("video"); v.src = f.url; v.controls = true; v.preload = "metadata"; v.playsInline = true; pv.appendChild(v); att.appendChild(pv);
      } else if (/^audio\//.test(t)) {
        const pv = el("div", "pv"), a = document.createElement("audio"); a.src = f.url; a.controls = true; pv.appendChild(a); att.appendChild(pv);
      }
    }
    att.appendChild(fileBar(m, f, row, att, true));
    body.appendChild(att); return;
  }

  // Banyak file dalam SATU kiriman
  const att = el("div", "att multi");
  const sum = el("div", "msum");
  sum.append(ico("file", true), el("b", "", fs.length + " file"), el("span", "", "· " + fmtSize(live.reduce((a, f) => a + f.size, 0))), el("span", "sp"));
  if (live.length > 1 && !m.oneTime) {
    const z = el("button", "btn"); z.type = "button"; setBtn(z, "down", "Unduh semua (.zip)");
    z.addEventListener("click", () => zipAll(m, z)); sum.appendChild(z);
  }
  att.appendChild(sum);

  const imgs = m.oneTime ? [] : live.filter(f => isImg(f.type));
  if (imgs.length) {
    const g = el("div", "grid" + (imgs.length === 1 ? " n1" : ""));
    g.style.gridTemplateColumns = "repeat(" + Math.min(3, imgs.length) + ",1fr)";
    imgs.slice(0, 6).forEach((f, i) => {
      const a = el("a", "tile"); a.href = f.url; a.target = "_blank"; a.rel = "noopener"; a.setAttribute("aria-label", "Buka " + f.name);
      const im = document.createElement("img"); im.src = f.url; im.loading = "lazy"; im.alt = f.name; a.appendChild(im);
      if (i === 5 && imgs.length > 6) a.appendChild(el("span", "more", "+" + (imgs.length - 6)));
      g.appendChild(a);
    });
    att.appendChild(g);
  }

  const LIM = 5, list = el("div", "flist");
  fs.forEach((f, i) => { const n = f.gone ? goneBox(goneText(f)) : fileBar(m, f, row, att, false); if (i >= LIM) n.hidden = true; list.appendChild(n); });
  att.appendChild(list);
  if (fs.length > LIM) {
    const mb = el("button", "moreFiles", "Tampilkan " + (fs.length - LIM) + " file lagi"); mb.type = "button"; let open = false;
    mb.addEventListener("click", () => {
      open = !open;
      Array.from(list.children).forEach((n, i) => { if (i >= LIM) n.hidden = !open; });
      mb.textContent = open ? "Ringkas daftar file" : "Tampilkan " + (fs.length - LIM) + " file lagi";
    });
    att.appendChild(mb);
  }
  body.appendChild(att);
}

function putRow(item, old) {
  const nr = render(item);
  if (old && old.isConnected) old.replaceWith(nr);
  else { const em = $("list").querySelector(".empty"); if (em) em.remove(); $("list").prepend(nr); shown++; }
  fitClamps(); applyFilter(); return nr;
}

async function delOne(row) {
  const m = row._m;
  if (!confirm("Hapus kiriman ini beserta semua filenya?")) return;
  const r = await fetch("/api/messages?key=" + encodeURIComponent(m.key), { method: "DELETE", headers: { "x-admin-key": adminKey } }).catch(() => null);
  if (r && r.ok) { selected.delete(m.key); row.remove(); shown = Math.max(0, shown - 1); applyFilter(); toast("Kiriman dihapus."); }
  else toast((r && (await r.json().catch(() => ({}))).error) || "Gagal menghapus.", true);
}

const inFolder = (f) => !!(f.folder && fById(f.folder));
const textIn = (m) => !!(m.tfolder && fById(m.tfolder));
const allMoved = (m) => {
  const live = (m.files || []).filter(f => !f.gone), th = !!m.text && textIn(m), fh = live.length > 0 && live.every(inFolder);
  return (th || fh) && !((m.text && !th) || live.some(f => !inFolder(f)));
};
function render(full) {
  const m = { ...full, files: full.files.filter(f => !inFolder(f)), text: textIn(full) ? "" : full.text }; // teks/file yang sudah di folder tidak tampil di daftar utama
  const row = el("article", "row"); row._m = full;
  row.appendChild(avatar(m.name));
  const body = el("div"); body.style.minWidth = "0"; row.appendChild(body);

  const head = el("div", "head");
  const when = el("span", "when", ago(m.createdAt)); when.title = fmtDate(m.createdAt);
  head.append(el("span", "name", m.name), when, el("span", "sp"));
  if (m.oneTime && m.files.some(f => !f.gone)) { const tg = el("span", "tag"); tg.appendChild(ico("lock", true)); tg.append("Sekali unduh"); head.appendChild(tg); }
  head.appendChild(life(m));
  if (adminKey) {
    const adm = el("span", "adm");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.className = "sel"; cb.setAttribute("aria-label", "Pilih kiriman ini"); cb.checked = selected.has(m.key);
    cb.addEventListener("change", () => { cb.checked ? selected.add(m.key) : selected.delete(m.key); updateBulk(); });
    const ed = el("button", "btn ghost icon"); ed.type = "button"; ed.title = "Ubah masa simpan"; ed.setAttribute("aria-label", "Ubah masa simpan"); ed.appendChild(ico("clock", true));
    ed.addEventListener("click", () => openEdit(row));
    const del = el("button", "btn ghost icon"); del.type = "button"; del.title = "Hapus kiriman"; del.setAttribute("aria-label", "Hapus kiriman ini"); del.appendChild(ico("trash", true));
    del.addEventListener("click", () => delOne(row));
    adm.append(cb, ed); // tombol pindah teks ke folder (hanya jika kiriman punya teks)
    if (full.text) { const mt = el("button", "btn ghost icon"); mt.type = "button"; mt.title = "Pindahkan teks ke folder"; mt.setAttribute("aria-label", "Pindahkan teks ke folder"); mt.appendChild(ico("folder", true)); mt.addEventListener("click", () => moveText(full, row)); adm.appendChild(mt); }
    adm.append(del); head.appendChild(adm);
  }
  body.appendChild(head);

  if (m.text) {
    const p = el("p", "text clamp", m.text); body.appendChild(p);
    let full = m.truncated ? null : m.text, open = false;
    const getFull = async () => {
      if (full !== null) return full;
      const r = await fetch("/api/messages?key=" + encodeURIComponent(m.key), aHdr());
      if (!r.ok) throw new Error("load");
      full = (await r.json()).text; return full;
    };
    const acts = el("div", "acts");
    const cp = el("button", "act"); cp.type = "button"; setBtn(cp, "copy", "Salin");
    const dt = el("button", "act"); dt.type = "button"; setBtn(dt, "down", "Unduh");
    const tg = el("button", "act", "Selengkapnya"); tg.type = "button"; tg.hidden = !m.truncated;
    cp.addEventListener("click", async () => {
      try {
        await copyText(await getFull());
        cp.classList.add("ok"); setBtn(cp, "check", "Tersalin");
        setTimeout(() => { cp.classList.remove("ok"); setBtn(cp, "copy", "Salin"); }, 1800);
      } catch { toast("Gagal menyalin teks.", true); }
    });
    dt.addEventListener("click", async () => {
      try {
        const txt = await getFull(), d = new Date(m.createdAt).toISOString().slice(0, 10);
        saveBlob(new Blob([txt], { type: "text/plain;charset=utf-8" }), "upload-aja-" + d + ".txt");
      } catch { toast("Gagal mengunduh teks.", true); }
    });
    tg.addEventListener("click", async () => {
      try {
        if (!open) { p.textContent = await getFull(); p.classList.remove("clamp"); tg.textContent = "Ringkas"; open = true; }
        else { p.classList.add("clamp"); tg.textContent = "Selengkapnya"; open = false; }
      } catch { toast("Gagal memuat teks lengkap.", true); }
    });
    acts.append(cp, dt, tg); body.appendChild(acts);
    pending.push(() => { tg.hidden = !m.truncated && p.scrollHeight <= p.clientHeight + 1; });
  }

  if (m.files.length) attachments(m, body, row);
  return row;
}

// ---- Cari & filter (di kiriman yang sudah dimuat) ----
function rowMatch(m) {
  if (allMoved(m)) return false;
  const q = $("fq").value.trim().toLowerCase(), f = $("ff").value, fs = m.files || [];
  if (f === "files" && !fs.length) return false;
  if (f === "text" && fs.length) return false;
  if (f === "once" && !(m.oneTime && fs.some(x => !x.gone))) return false;
  if (f === "forever" && m.expiresAt) return false;
  if (q && !(m.name + " " + (m.text || "") + " " + fs.map(x => x.name).join(" ")).toLowerCase().includes(q)) return false;
  return true;
}
function applyFilter() {
  const rows = Array.from($("list").querySelectorAll(".row")), nm = $("list").querySelector(".nomatch");
  if (nm) nm.remove();
  let n = 0;
  rows.forEach(r => { const ok = rowMatch(r._m); r.hidden = !ok; if (ok) n++; });
  const filtering = $("fq").value.trim() || $("ff").value !== "all";
  if (rows.length && !n) { const e = (filtering ? emptyState("Tidak ada yang cocok", "Ubah kata kunci atau filter. Pencarian hanya mencakup kiriman yang sudah dimuat.") : emptyState("Semua file sudah ada di folder", "Buka salah satu folder di atas untuk melihat isinya.")); e.classList.add("nomatch"); $("list").appendChild(e); }
  $("count").textContent = shown ? (filtering || n !== shown ? n + " dari " + shown : shown) + " item" : "";
  updateBulk();
}
$("fq").addEventListener("input", applyFilter);
$("ff").addEventListener("change", applyFilter);

function emptyState(title, sub) {
  const e = el("div", "empty"), ic = el("div", "ic"); ic.appendChild(ico("inbox"));
  e.append(ic, el("b", "", title), sub); return e;
}

const aHdr = () => (adminKey ? { headers: { "x-admin-key": adminKey } } : undefined); // admin ikut melihat kiriman "Selamanya"
async function load(more) {
  const r = await fetch("/api/messages" + (more && cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), aHdr()).catch(() => null);
  if (!r || !r.ok) { $("list").textContent = ""; shown = 0; updateCount(); $("list").appendChild(emptyState("Kiriman belum bisa dimuat", "Pastikan KV sudah dihubungkan ke project ini.")); $("more").hidden = true; return; }
  const d = await r.json(); cursor = d.cursor;
  if (!more) { $("list").textContent = ""; shown = 0; selected.clear(); }
  d.items.forEach(m => $("list").appendChild(render(m)));
  shown += d.items.length; updateCount(); fitClamps();
  if (!more && !d.items.length) $("list").appendChild(emptyState("Belum ada kiriman", "Upload file atau tulis catatan pertama lewat form."));
  $("more").hidden = !cursor;
}
$("more").addEventListener("click", () => load(true));
$("refresh").addEventListener("click", () => load(false));

// ---- Upload ----
// Semua file dalam satu kali upload masuk ke SATU kiriman (satu status):
// file pertama membuat kiriman, file berikutnya ditambahkan ke kiriman yang sama.
function post(fd, onProg, url) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url || "/api/messages");
    if (adminKey) xhr.setRequestHeader("x-admin-key", adminKey);
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) onProg(ev.loaded / ev.total); };
    xhr.onload = () => { let d = {}; try { d = JSON.parse(xhr.responseText); } catch {} resolve({ ok: xhr.status === 201, status: xhr.status, d }); };
    xhr.onerror = () => resolve({ ok: false, status: 0, d: { error: "Koneksi terputus." } });
    xhr.send(fd);
  });
}
function mkFd(text, extra) {
  const fd = new FormData();
  fd.append("name", $("name").value); fd.append("text", text);
  fd.append("ttl", document.querySelector('input[name="ttl"]:checked').value);
  if (extra) { fd.append("file", extra); fd.append("oneTime", $("once").checked ? "1" : "0"); }
  return fd;
}
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  let text = ta.value.trim();
  if (!text && !files.length) { toast("Tulis catatan atau pilih file dulu.", true); return; }
  try { localStorage.setItem("nama", $("name").value); } catch {}

  busy = true; $("send").disabled = true; refreshUI();

  // hanya teks
  if (!files.length) {
    const r = await post(mkFd(text, null), () => {});
    busy = false; $("send").disabled = false; refreshUI();
    if (r.ok) { ta.value = ""; ta.style.height = ""; toast("Berhasil diupload."); putRow(r.d.item, null); }
    else toast(r.d.error || "Gagal upload. Coba lagi.", true);
    return;
  }

  if (cur && text) cur = null; // catatan baru = kiriman baru
  const queue = files.filter(x => x.state !== "done");
  const totalBytes = queue.reduce((a, x) => a + x.file.size, 0) || 1;
  const continuing = !!cur;
  let doneBytes = 0, okN = 0, failN = 0;
  $("bar").hidden = false; $("bar").value = 0; $("upst").hidden = false;
  queue.forEach(x => { x.state = "wait"; x.st.className = "st"; x.st.textContent = "Menunggu"; x.node.classList.remove("err"); });

  for (let i = 0; i < queue.length; i++) {
    const x = queue[i], attach = !!cur;
    $("upst").textContent = `Mengupload ${i + 1} dari ${queue.length}: ${x.file.name}`;
    x.st.textContent = "0%";
    let fd;
    if (attach) { fd = new FormData(); fd.append("token", cur.token); fd.append("file", x.file); }
    else fd = mkFd(text, x.file);
    const r = await post(fd, (frac) => {
      x.st.textContent = Math.round(frac * 100) + "%";
      $("bar").value = (doneBytes + frac * x.file.size) / totalBytes * 100;
    }, attach ? "/api/messages?attach=" + encodeURIComponent(cur.key) : "/api/messages");
    doneBytes += x.file.size;
    $("bar").value = doneBytes / totalBytes * 100;
    if (r.ok) {
      okN++; x.state = "done"; x.st.className = "st ok"; x.st.textContent = "Selesai";
      if (!attach) {
        cur = { key: r.d.item.key, token: r.d.token, row: null };
        if (text) { text = ""; ta.value = ""; ta.style.height = ""; }
      }
      cur.row = putRow(r.d.item, cur.row);
    } else {
      failN++; x.state = "fail"; x.node.classList.add("err");
      x.st.textContent = "Gagal"; x.sub.className = "bad"; x.sub.textContent = r.d.error || "Gagal upload.";
      if (attach && [403, 404, 410].includes(r.status)) cur = null; // kiriman tidak bisa dilanjutkan lagi
    }
  }

  busy = false; $("send").disabled = false; $("bar").hidden = true; $("upst").hidden = true;
  const again = failN && cur;
  if (!failN) cur = null;
  // buang yang sukses (tampilkan sebentar), sisakan yang gagal untuk dicoba lagi
  const okFiles = files.filter(x => x.state === "done");
  setTimeout(() => okFiles.forEach(x => { if (!busy) removeFile(x); }), 1200);
  files.filter(x => x.state === "fail").forEach(x => { x.state = "wait"; });
  refreshUI();
  if (failN) toast(`${okN} file berhasil, ${failN} gagal. Yang gagal masih ada di daftar; tekan Upload untuk menambahkannya ${again ? "ke kiriman yang sama" : "sebagai kiriman baru"}.`, true);
  else if (okN > 1) toast(`${okN} file berhasil diupload dalam 1 kiriman.`);
  else toast(continuing ? "File ditambahkan ke kiriman." : "Berhasil diupload.");
});

// ---- Admin ----
const dlg = $("dlg");
async function adminApi(action, params) {
  const q = new URLSearchParams({ action, ...(params || {}) });
  try {
    const r = await fetch("/api/admin?" + q, { method: "POST", headers: { "x-admin-key": adminKey } });
    return { ok: r.ok, status: r.status, d: await r.json().catch(() => ({})) };
  } catch { return { ok: false, status: 0, d: { error: "Koneksi terputus." } }; }
}
// 30 hari & Selamanya hanya bisa dipilih admin (server juga memeriksa)
function syncLocks() {
  const on = !!adminKey;
  document.querySelectorAll("label.lk input").forEach(i => { i.disabled = !on; });
  $("lockHint").hidden = on;
  const c = document.querySelector('input[name="ttl"]:checked');
  if (!on && (!c || c.disabled)) document.querySelector('input[name="ttl"][value="7"]').checked = true;
}
document.querySelectorAll("label.lk").forEach(l => l.addEventListener("click", (e) => {
  if (!adminKey) { e.preventDefault(); toast("30 hari dan Selamanya terkunci. Masuk lewat menu Admin dulu.", true); }
}));
function updateBulk() {
  $("bulk").hidden = !adminKey;
  if (!adminKey) return;
  const n = selected.size, vis = Array.from($("list").querySelectorAll(".row")).filter(r => !r.hidden);
  $("selN").textContent = n ? n + " dipilih" : "";
  $("bulkDel").disabled = !n;
  $("selAll").checked = vis.length > 0 && vis.every(r => selected.has(r._m.key));
}
$("selAll").addEventListener("change", () => {
  const on = $("selAll").checked;
  $("list").querySelectorAll(".row").forEach(r => {
    if (r.hidden) return;
    on ? selected.add(r._m.key) : selected.delete(r._m.key);
    const cb = r.querySelector(".sel"); if (cb) cb.checked = on;
  });
  updateBulk();
});
$("bulkDel").addEventListener("click", async () => {
  const keys = Array.from(selected);
  if (!keys.length || !confirm(`Hapus ${keys.length} kiriman beserta semua filenya? Ini tidak bisa dibatalkan.`)) return;
  $("bulkDel").disabled = true; let ok = 0;
  for (const k of keys) {
    const r = await fetch("/api/messages?key=" + encodeURIComponent(k), { method: "DELETE", headers: { "x-admin-key": adminKey } }).catch(() => null);
    if (!r || !r.ok) continue;
    ok++; selected.delete(k);
    const row = Array.from($("list").querySelectorAll(".row")).find(x => x._m.key === k);
    if (row) { row.remove(); shown = Math.max(0, shown - 1); }
  }
  applyFilter();
  toast(ok === keys.length ? ok + " kiriman dihapus." : `${ok} dari ${keys.length} kiriman dihapus.`, ok !== keys.length);
});

function showAdmin(on) {
  $("loginRow").hidden = on; $("tools").hidden = !on;
  $("adminBtn").classList.toggle("on", on);
  syncLocks(); updateBulk(); if (on) loadFolders();
}
$("adminBtn").addEventListener("click", () => { dlg.showModal(); if (!adminKey) $("key").focus(); });
$("dclose").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

async function login() {
  const k = $("key").value || adminKey;
  setMsg("astatus", "");
  const r = await fetch("/api/admin?action=check", { method: "POST", headers: { "x-admin-key": k } }).catch(() => null);
  if (!r || !r.ok) { setMsg("astatus", r ? "Kunci admin salah." : "Koneksi terputus.", true); return; }
  adminKey = k; try { sessionStorage.setItem("adminKey", k); } catch {}
  $("key").value = ""; showAdmin(true); load(false);
}
$("login").addEventListener("click", login);
$("key").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); login(); } });
$("logout").addEventListener("click", () => { fetch("/api/admin?action=logout", { method: "POST" }).catch(() => {}); adminKey = ""; selected.clear(); try { sessionStorage.removeItem("adminKey"); } catch {} showAdmin(false); dlg.close(); load(false); });

// Statistik
$("statBtn").addEventListener("click", async () => {
  $("statBtn").disabled = true; setMsg("sstatus", "Menghitung...");
  const t = { msgs: 0, files: 0, bytes: 0, forever: 0, once: 0 }; let c = "", okAll = false;
  for (;;) {
    const r = await adminApi("stats", c ? { cursor: c } : {});
    if (!r.ok) { setMsg("sstatus", r.d.error || "Gagal menghitung.", true); break; }
    for (const k in t) t[k] += r.d[k] || 0;
    setMsg("sstatus", `Menghitung... ${t.msgs} kiriman`);
    if (r.d.done) { okAll = true; break; }
    c = r.d.cursor;
  }
  if (okAll) {
    setMsg("sstatus", "");
    const box = $("stats"); box.textContent = ""; box.hidden = false;
    [["Kiriman", t.msgs], ["File tersimpan", t.files], ["Total ukuran", fmtSize(t.bytes)], ["Tanpa batas", t.forever], ["Sekali unduh", t.once]].forEach(([l, v]) => {
      const d = el("div", "stat"); d.append(el("b", "", String(v)), el("span", "", l)); box.appendChild(d);
    });
  }
  $("statBtn").disabled = false;
});

// Hapus file lama / hapus semua (dipakai bersama)
async function runCleanup(days, all, btn, statusId) {
  btn.disabled = true; setMsg(statusId, "Memproses...");
  let cur2 = "", nf = 0, nm = 0;
  try {
    for (;;) {
      const q = new URLSearchParams({ days, scope: all ? "all" : "files" }); if (cur2) q.set("cursor", cur2);
      const r = await fetch("/api/cleanup?" + q, { method: "POST", headers: { "x-admin-key": adminKey } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(statusId, d.error || "Gagal membersihkan.", true); break; }
      nf += d.filesDeleted; nm += d.msgsDeleted;
      setMsg(statusId, `Memproses... ${nf} file dihapus`);
      if (d.done) { setMsg(statusId, `Selesai: ${nf} file${all ? " dan " + nm + " kiriman" : ""} dihapus.`); load(false); break; }
      cur2 = d.cursor;
    }
  } catch { setMsg(statusId, "Koneksi terputus. Jalankan lagi untuk melanjutkan.", true); }
  btn.disabled = false;
}
$("cleanup").addEventListener("click", () => {
  const days = $("cdays").value, all = $("callmsg").checked;
  if (!confirm(`Hapus ${all ? "pesan dan file" : "file"} yang lebih lama dari ${days} hari? Ini tidak bisa dibatalkan.`)) return;
  runCleanup(days, all, $("cleanup"), "cstatus");
});
$("wipe").addEventListener("click", () => {
  const t = prompt("Ini menghapus SEMUA kiriman dan file, dan tidak bisa dibatalkan.\nKetik HAPUS untuk melanjutkan:");
  if (t !== "HAPUS") return;
  runCleanup(0, true, $("wipe"), "ostatus");
});

// File yatim: file di KV yang sudah tidak punya kiriman (mis. upload terputus)
async function scanOrphans(del) {
  let c = "", found = 0, deleted = 0;
  for (;;) {
    const p = {}; if (c) p.cursor = c; if (del) p.del = "1";
    const r = await adminApi("orphans", p);
    if (!r.ok) return { err: r.d.error || "Gagal memindai." };
    found += r.d.found; deleted += r.d.deleted;
    setMsg("ostatus", (del ? "Menghapus... " : "Memindai... ") + (del ? deleted : found) + " file yatim");
    if (r.d.done) return { found, deleted };
    c = r.d.cursor;
  }
}
$("orph").addEventListener("click", async () => {
  $("orph").disabled = true; setMsg("ostatus", "Memindai...");
  const a = await scanOrphans(false);
  if (a.err) setMsg("ostatus", a.err, true);
  else if (!a.found) setMsg("ostatus", "Tidak ada file yatim.");
  else if (confirm(`Ditemukan ${a.found} file yatim. Hapus sekarang?`)) {
    const b = await scanOrphans(true);
    setMsg("ostatus", b.err || `Selesai: ${b.deleted} file yatim dihapus.`, !!b.err);
  } else setMsg("ostatus", `${a.found} file yatim dibiarkan.`);
  $("orph").disabled = false;
});

// Ubah masa simpan satu kiriman
const edlg = $("edlg"); let editRow = null;
function openEdit(row) {
  editRow = row; const m = row._m;
  $("edinfo").textContent = m.expiresAt ? "Saat ini dihapus otomatis " + fmtDate(m.expiresAt) + "." : "Saat ini disimpan tanpa batas.";
  setMsg("edstatus", ""); edlg.showModal();
}
$("edclose").addEventListener("click", () => edlg.close());
edlg.addEventListener("click", (e) => { if (e.target === edlg) edlg.close(); });
$("edsave").addEventListener("click", async () => {
  const row = editRow; if (!row) return;
  const m = row._m, days = $("edays").value, live = m.files.filter(f => !f.gone);
  $("edsave").disabled = true;
  try {
    for (let i = 0; i < live.length; i++) {
      setMsg("edstatus", `Memperbarui file ${i + 1} dari ${live.length}...`);
      const r = await adminApi("ttl", { key: m.key, days, fid: live[i].id });
      if (!r.ok) throw new Error(r.d.error || "Gagal memperbarui file.");
    }
    setMsg("edstatus", "Memperbarui kiriman...");
    const r = await adminApi("ttl", { key: m.key, days });
    if (!r.ok) throw new Error(r.d.error || "Gagal memperbarui kiriman.");
    putRow(r.d.item, row); edlg.close(); toast("Masa simpan diperbarui.");
  } catch (e) { setMsg("edstatus", e.message || "Gagal.", true); }
  $("edsave").disabled = false;
});

// ---- Folder (admin) ----
const fdlg = $("fdlg"), mdlg = $("mdlg");
let folders = [], fcur = "", fitems = [], fcursor = null, ftok = 0, mRes = null; const fsel = new Set();
async function fApi(action, params) {
  const q = new URLSearchParams({ action, ...(params || {}) });
  try {
    const r = await fetch("/api/folders?" + q, adminKey ? { method: "POST", headers: { "x-admin-key": adminKey } } : undefined);
    return { ok: r.ok, d: await r.json().catch(() => ({})) };
  } catch { return { ok: false, d: { error: "Koneksi terputus." } }; }
}
const fById = (id) => folders.find((f) => f.id === id);
function fPath(id) { const a = []; for (let f = fById(id), n = 0; f && n < 100; f = fById(f.parent), n++) a.unshift(f); return a; }
const isUnder = (id, anc) => fPath(id).some((f) => f.id === anc);
async function loadFolders() { const r = await fApi("list"); if (r.ok) { folders = r.d.folders || []; renderBar(); } return r.ok; }

// Dialog pilih folder tujuan. Hasil: id folder ("" = akar) atau null jika dibatalkan.
function pickFolder(title, info, exclude) {
  $("mtitle").textContent = title; $("minfo").textContent = info || "";
  const s = $("msel"); s.textContent = "";
  const add = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); };
  add("", "Akar (tanpa folder)");
  folders.filter((f) => !exclude || (f.id !== exclude && !isUnder(f.id, exclude)))
    .map((f) => ({ id: f.id, p: fPath(f.id).map((x) => x.name).join(" / ") })).sort((a, b) => a.p.localeCompare(b.p)).forEach((x) => add(x.id, x.p));
  mdlg.returnValue = "";
  return new Promise((res) => { mRes = res; mdlg.showModal(); });
}
mdlg.addEventListener("close", () => { if (mRes) mRes(mdlg.returnValue === "ok" ? $("msel").value : null); mRes = null; });
$("mok").addEventListener("click", () => mdlg.close("ok"));
$("mclose").addEventListener("click", () => mdlg.close());
mdlg.addEventListener("click", (e) => { if (e.target === mdlg) mdlg.close(); });

async function moveOne(m, f, row) {
  await loadFolders();
  const t = await pickFolder("Pindahkan file", f.name); if (t === null) return;
  const r = await fApi("move", { key: m.key, fids: f.id, folder: t });
  if (r.ok) { putRow(r.d.item, row); toast("File dipindahkan."); } else toast(r.d.error || "Gagal memindahkan.", true);
}

function renderBar() {
  const bar = $("folderBar"), roots = folders.filter(f => !f.parent).sort((a, b) => a.name.localeCompare(b.name));
  bar.textContent = ""; bar.hidden = !roots.length; if (!roots.length) return;
  bar.appendChild(el("b", "", "Folder"));
  roots.forEach(f => { const b = el("button", "fchip"); b.type = "button"; b.append(ico("folder", true), f.name); b.addEventListener("click", () => { fdlg.showModal(); openF(f.id); }); bar.appendChild(b); });
}
async function moveText(m, row) {
  await loadFolders();
  const t = await pickFolder("Pindahkan teks", (m.text || "").slice(0, 80)); if (t === null) return;
  const r = await fApi("move", { key: m.key, text: "1", folder: t });
  if (r.ok) { putRow(r.d.item, row); toast("Teks dipindahkan."); } else toast(r.d.error || "Gagal memindahkan.", true);
}
async function fullText(it) {
  if (!it.truncated) return it.text;
  const r = await fetch("/api/messages?key=" + encodeURIComponent(it.key), aHdr()); if (!r.ok) throw new Error("load");
  return (await r.json()).text;
}
const iid = (it) => it.key + "|" + (it.file ? it.file.id : "@text");
async function openF(id) { fcur = id || ""; fsel.clear(); fitems = []; fcursor = null; renderF(); await loadF(false); }
async function loadF(more) {
  const tok = ++ftok; let c = more ? fcursor : null, got = 0, done = false;
  if (!fcur && !adminKey) { $("fmore").hidden = true; setMsg("fstatus", ""); renderF(); return; } // publik: file tanpa folder ada di daftar utama
  for (let i = 0; i < 6 && !done && got < 15; i++) {
    setMsg("fstatus", "Memuat file...");
    const r = await fApi("contents", { folder: fcur, ...(c ? { cursor: c } : {}) });
    if (tok !== ftok) return;
    if (!r.ok) { setMsg("fstatus", r.d.error || "Gagal memuat.", true); return; }
    fitems = fitems.concat(r.d.files); got += r.d.files.length; done = r.d.done; c = r.d.cursor;
  }
  fcursor = c; $("fmore").hidden = done;
  setMsg("fstatus", fitems.length || !done ? "" : "Tidak ada isi di sini."); renderF();
}
function fBtn(text, fn, cls) { const b = el("button", "btn " + (cls || "ghost sm"), text); b.type = "button"; b.addEventListener("click", fn); return b; }
async function fDo(action, params, okMsg) {
  const r = await fApi(action, params);
  if (r.ok) { folders = r.d.folders || folders; if (okMsg) toast(okMsg); renderBar(); renderF(); if (action === "delete") load(false); } else toast(r.d.error || "Gagal.", true);
  return r.ok;
}
// Salin isi file teks (txt, md, csv, json, kode, dll). File "sekali unduh" tidak diberi tombol ini karena membaca = menghabiskan file.
const TXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|mjs|ts|tsx|jsx|vue|py|java|kt|swift|c|h|cpp|cs|go|rs|rb|php|r|sh|bat|ps1|sql|yaml|yml|toml|ini|cfg|conf|env|log|srt|vtt|tex|svg)$/i;
const isTextFile = (f) => /^text\//.test(f.type) || /json|xml|javascript|yaml|x-sh|sql|csv/.test(f.type) || TXT_EXT.test(f.name);
async function copyFileText(f, btn) {
  if (f.size > 5 * 1024 * 1024) { toast("File teks terlalu besar untuk disalin (maks. 5 MB). Silakan unduh.", true); return; }
  const old = btn.textContent; btn.disabled = true; btn.textContent = "Menyalin...";
  let done = false;
  try {
    const r = await fetch(f.url); if (!r.ok) throw new Error("fetch");
    const t = await r.text();
    if (t.includes("\u0000")) toast("Ini bukan file teks, tidak bisa disalin. Silakan unduh.", true);
    else if (!t) toast("File ini kosong, tidak ada teks untuk disalin.", true);
    else { await copyText(t); done = true; toast("Teks dari " + f.name + " disalin."); }
  } catch { toast("Gagal menyalin teks.", true); }
  btn.disabled = false; btn.textContent = done ? "Tersalin" : old;
  if (done) setTimeout(() => { btn.textContent = old; }, 1800);
}
function renderF() {
  const adm = !!adminKey; document.querySelector("#fdlg .ftool").hidden = !adm;
  const cr = $("fcrumbs"); cr.textContent = "";
  cr.appendChild(fBtn(adm ? "Semua file" : "Folder", () => openF("")));
  fPath(fcur).forEach((f) => { cr.append("/"); cr.appendChild(fBtn(f.name, () => openF(f.id))); });
  $("fdtitle").textContent = fcur && fById(fcur) ? fById(fcur).name : "Folder";

  const sb = $("fsubs"); sb.textContent = "";
  folders.filter((f) => f.parent === fcur).sort((a, b) => a.name.localeCompare(b.name)).forEach((f) => {
    const row = el("div", "fbar"), lead = el("span", "badge"); lead.appendChild(ico("folder"));
    const t = el("span", "t"), nm = el("b", "", f.name); nm.style.cursor = "pointer"; nm.addEventListener("click", () => openF(f.id));
    const kids = folders.filter((x) => x.parent === f.id).length;
    t.append(nm, el("span", "", kids ? kids + " subfolder" : "Folder"));
    row.append(lead, t, fBtn("Buka", () => openF(f.id)));
    if (adm) row.append(
      fBtn("Ubah nama", () => { const n = prompt("Nama baru folder:", f.name); if (n && n.trim()) fDo("rename", { id: f.id, name: n.trim() }, "Nama diubah."); }),
      fBtn("Pindah", async () => { const t2 = await pickFolder("Pindahkan folder", f.name, f.id); if (t2 !== null) fDo("movefolder", { id: f.id, parent: t2 }, "Folder dipindahkan."); }),
      fBtn("Hapus", () => { if (confirm('Hapus folder "' + f.name + '"? Isinya TIDAK dihapus: subfolder naik satu tingkat dan file kembali ke "Semua file".')) fDo("delete", { id: f.id }, "Folder dihapus."); }));
    sb.appendChild(row);
  });

  const fb = $("ffiles"); fb.textContent = "";
  fitems.forEach((it) => {
    const id = iid(it), row = el("label", "fbar");
    if (!it.file) { // item teks
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = fsel.has(id); cb.hidden = !adm;
      cb.addEventListener("change", () => { cb.checked ? fsel.add(id) : fsel.delete(id); updF(); });
      const t = el("span", "t"); t.append(el("b", "", it.text.replace(/\s+/g, " ").slice(0, 90) || "(teks kosong)"), el("span", "", "Teks · dari " + it.from + " · " + fmtDate(it.createdAt)));
      const cp = fBtn("Salin teks", async () => { try { await copyText(await fullText(it)); cp.textContent = "Tersalin"; setTimeout(() => { cp.textContent = "Salin teks"; }, 1800); toast("Teks disalin."); } catch { toast("Gagal menyalin teks.", true); } });
      const dt = fBtn("Unduh", async () => { try { saveBlob(new Blob([await fullText(it)], { type: "text/plain;charset=utf-8" }), "upload-aja-" + new Date(it.createdAt).toISOString().slice(0, 10) + ".txt"); } catch { toast("Gagal mengunduh teks.", true); } });
      row.append(cb, el("span", "badge", "TXT"), t, cp, dt); fb.appendChild(row); return;
    }
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = fsel.has(id); cb.hidden = !adm;
    cb.addEventListener("change", () => { cb.checked ? fsel.add(id) : fsel.delete(id); updF(); });
    const t = el("span", "t"); t.append(el("b", "", it.file.name), el("span", "", fmtSize(it.file.size) + " · dari " + it.from + " · " + fmtDate(it.createdAt)));
    const dl = el("a", "btn dl sm", "Unduh"); dl.href = it.oneTime ? it.file.url + "?dl=1" : it.file.url; dl.setAttribute("download", it.file.name);
    let lead = el("span", "badge", extOf(it.file.name)), op = null;
    if (!it.oneTime && isImg(it.file.type)) { lead = el("a", "badge th"); lead.href = it.file.url; lead.target = "_blank"; lead.rel = "noopener"; const im = document.createElement("img"); im.src = it.file.url; im.loading = "lazy"; im.alt = ""; lead.appendChild(im); }
    if (!it.oneTime && INL.test(it.file.type)) { op = el("a", "btn ghost sm", "Buka"); op.href = it.file.url; op.target = "_blank"; op.rel = "noopener"; }
    row.append(cb, lead, t);
    if (!it.oneTime && isTextFile(it.file)) { const cp = fBtn("Salin teks", () => copyFileText(it.file, cp)); cp.title = "Salin isi file ke papan klip"; row.appendChild(cp); }
    if (op) row.appendChild(op); row.appendChild(dl); fb.appendChild(row);
  });
  updF();
}
function updF() { const n = fsel.size; $("fmv").disabled = !n; $("fmv").textContent = n ? "Pindahkan terpilih (" + n + ")" : "Pindahkan terpilih"; }

$("fopen").addEventListener("click", async () => { await loadFolders(); fdlg.showModal(); openF(""); });
$("fdclose").addEventListener("click", () => fdlg.close());
fdlg.addEventListener("click", (e) => { if (e.target === fdlg) fdlg.close(); });
$("fmore").addEventListener("click", () => loadF(true));
$("fnew").addEventListener("click", () => { const n = prompt("Nama folder baru" + (fcur ? " (di dalam " + fById(fcur).name + ")" : "") + ":"); if (n && n.trim()) fDo("create", { name: n.trim(), parent: fcur }, "Folder dibuat."); });
$("fall").addEventListener("click", () => { const all = fitems.length && fitems.every((it) => fsel.has(iid(it))); fitems.forEach((it) => all ? fsel.delete(iid(it)) : fsel.add(iid(it))); renderF(); });
$("fmv").addEventListener("click", async () => {
  const t = await pickFolder("Pindahkan " + fsel.size + " file", "", null); if (t === null) return;
  const by = {}; fsel.forEach((id) => { const [k, f] = id.split("|"); (by[k] = by[k] || []).push(f); });
  const mvp = (k) => ({ key: k, fids: by[k].filter((x) => x !== "@text").join(","), ...(by[k].includes("@text") ? { text: "1" } : {}), folder: t });
  $("fmv").disabled = true; let moved = 0, fail = 0;
  for (const k of Object.keys(by)) { setMsg("fstatus", "Memindahkan..."); const r = await fApi("move", mvp(k)); if (r.ok) moved += r.d.moved; else fail += by[k].length; }
  toast(moved + " file dipindahkan" + (fail ? ", " + fail + " gagal" : "") + ".", !!fail);
  fsel.clear(); load(false); openF(fcur);
});

showAdmin(!!adminKey);
const boot = () => loadFolders().then(() => load(false), () => load(false));
if (adminKey) {
  // Sesi tersimpan: pasang ulang cookie admin (dipakai gambar/unduhan file "Selamanya"); kunci tak valid = keluar.
  fetch("/api/admin?action=check", { method: "POST", headers: { "x-admin-key": adminKey } })
    .then((r) => { if (r.status === 401) { adminKey = ""; try { sessionStorage.removeItem("adminKey"); } catch {} showAdmin(false); } })
    .catch(() => {}).finally(boot);
} else boot();
