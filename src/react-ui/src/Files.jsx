import React, { useMemo, useRef, useState } from "react";
import { api, DELETE_LIST_PREFIX, MACRO_PREFIX } from "./controller.js";
import { Modal, Confirm } from "./ui.jsx";

const OK_EXT = ["nc", "ngc", "gcode", "gc"];

export default function Files({ state, cfg, idle }) {
  const fileIn = useRef(null), dirIn = useRef(null);
  const [folder, setFolder] = useState(() => state.folder || "default");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [sel, setSel] = useState([]);
  const [dlg, setDlg] = useState(null);
  const [newName, setNewName] = useState("");

  const macroFiles = (state.macros_list || []).map((m) => m.file_name);
  const lists = state.gcode_list || [];
  const folders = lists.filter((f) => f.type === "folder").map((f) => f.name);
  const inFolder = lists.find((f) => f.type === "folder" && f.name === folder);
  const all = (state.files || []).filter((f) => !f.startsWith(MACRO_PREFIX) && !macroFiles.includes(f));
  const names = inFolder ? inFolder.files.map((f) => f.file_name).filter((n) => all.includes(n)) : lists.length ? [] : all;

  const shown = useMemo(() => {
    let l = names.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    if (sort === "az") l = [...l].sort((a, b) => a.localeCompare(b));
    if (sort === "za") l = [...l].sort((a, b) => b.localeCompare(a));
    return l;
  }, [names.join("|"), q, sort]);

  const pick = (f) => fetch(`/api/file/${encodeURIComponent(f)}`).catch(() => setErr("Could not open that file."));

  const upload = async (list, folderName) => {
    setErr("");
    const files = [...list];
    const good = files.filter((f) => OK_EXT.includes(f.name.split(".").pop().toLowerCase()));
    const bad = files.filter((f) => !good.includes(f));
    if (bad.length) setErr(`Skipped ${bad.map((f) => f.name).join(", ")}. Programs must end in .nc, .ngc, .gcode or .gc.`);
    const done = [];
    for (let i = 0; i < good.length; i++) {
      setBusy(`Uploading ${i + 1} of ${good.length}: ${good[i].name}`);
      try {
        const r = await fetch(`/api/file/${encodeURIComponent(good[i].name)}`, { method: "PUT", body: good[i] });
        if (!r.ok) throw new Error(await r.text());
        done.push(good[i].name);
      } catch (e) { setErr(`Upload failed for ${good[i].name}: ${e.message}`); }
    }
    setBusy("");
    if (!done.length) return;
    const target = folderName || folder;
    try {
      await cfg.save((c) => {
        c.non_macros_list = c.non_macros_list || [];
        c.gcode_list = c.gcode_list || [];
        let f = c.gcode_list.find((x) => x.type === "folder" && x.name === target);
        if (!f) { f = { name: target, type: "folder", files: [] }; c.gcode_list.push(f); }
        for (const n of done) {
          if (!c.non_macros_list.some((x) => x.file_name === n)) c.non_macros_list.push({ file_name: n });
          if (!f.files.some((x) => x.file_name === n)) f.files.push({ file_name: n });
        }
      });
      if (folderName) setFolder(folderName);
    } catch (e) { setErr(`Saved the files but not the folder list: ${e.message}`); }
  };

  const removeFiles = async (list) => {
    setDlg(null);
    const keep = macroFiles;
    const del = list.filter((n) => !keep.includes(n));
    try {
      if (del.length) await api.del(`file/${DELETE_LIST_PREFIX}${del.join(",")}`);
      await cfg.save((c) => {
        c.non_macros_list = (c.non_macros_list || []).filter((x) => !list.includes(x.file_name));
        for (const f of c.gcode_list || []) f.files = f.files.filter((x) => !list.includes(x.file_name));
      });
      setSel([]);
    } catch (e) { setErr(e.message); }
  };

  const addFolder = async () => {
    const n = newName.trim();
    if (!n) return;
    if (folders.includes(n)) { setErr("A folder with that name already exists."); return; }
    setDlg(null); setNewName("");
    try { await cfg.save((c) => { c.gcode_list = c.gcode_list || []; c.gcode_list.push({ name: n, type: "folder", files: [] }); }); setFolder(n); } catch (e) { setErr(e.message); }
  };

  const removeFolder = async (withFiles) => {
    setDlg(null);
    if (folder === "default") return;
    const target = lists.find((f) => f.name === folder);
    try {
      if (withFiles && target) {
        const del = target.files.map((f) => f.file_name).filter((n) => !macroFiles.includes(n));
        if (del.length) await api.del(`file/${DELETE_LIST_PREFIX}${del.join(",")}`);
      }
      await cfg.save((c) => {
        const t = c.gcode_list.find((f) => f.name === folder);
        if (t && !withFiles) { const d = c.gcode_list.find((f) => f.name === "default"); if (d) d.files = [...d.files, ...t.files]; }
        if (t && withFiles) c.non_macros_list = (c.non_macros_list || []).filter((x) => !t.files.some((f) => f.file_name === x.file_name));
        c.gcode_list = c.gcode_list.filter((f) => f.name !== folder);
      });
      setFolder("default");
    } catch (e) { setErr(e.message); }
  };

  const toggle = (n) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));

  return (
    <div className="files">
      <div className="files-head">
        <button disabled={!idle} className="primary" onClick={() => fileIn.current.click()}>Upload files</button>
        <button disabled={!idle} onClick={() => dirIn.current.click()}>Upload folder</button>
        <input ref={fileIn} type="file" multiple hidden accept=".nc,.ngc,.gcode,.gc" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        <input ref={dirIn} type="file" hidden webkitdirectory="" directory="" onChange={(e) => { const f = [...e.target.files]; if (f.length) upload(f, f[0].webkitRelativePath.split("/")[0]); e.target.value = ""; }} />
        <a className={`btn${state.selected ? "" : " disabled"}`} href={state.selected ? `/api/file/${encodeURIComponent(state.selected)}` : undefined} download={state.selected || undefined}>Download selected</a>
        <span className="grow" />
        <select aria-label="Folder" value={folder} disabled={!idle} onChange={(e) => { setFolder(e.target.value); setSel([]); }}>
          <option value="default">Default folder</option>
          {folders.filter((f) => f !== "default").map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button disabled={!idle} onClick={() => setDlg("newfolder")}>New folder</button>
        <button disabled={!idle || folder === "default"} onClick={() => setDlg("delfolder")}>Delete folder</button>
      </div>
      <div className="files-head">
        <input className="search" type="search" placeholder="Search programs" aria-label="Search programs" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Upload order</option><option value="az">A to Z</option><option value="za">Z to A</option></select>
        <button disabled={!sel.length || !idle} className="danger-quiet" onClick={() => setDlg("delfiles")}>Delete {sel.length || ""} selected</button>
        {busy && <span className="dim">{busy}</span>}
        {err && <span className="err">{err}</span>}
      </div>
      {shown.length === 0 && <p className="empty">{q ? "No programs match that search." : "No programs in this folder. Upload a G-code file to get started."}</p>}
      <ul>
        {shown.map((f) => (
          <li key={f} className={f === state.selected ? "sel" : ""}>
            <input type="checkbox" aria-label={`Select ${f}`} checked={sel.includes(f)} onChange={() => toggle(f)} />
            <button className="name" disabled={!idle} onClick={() => pick(f)}>{f}{f === state.selected && <small> — loaded</small>}</button>
          </li>
        ))}
      </ul>

      {dlg === "newfolder" && (
        <Modal title="New folder" onClose={() => setDlg(null)} actions={<><button onClick={() => setDlg(null)}>Cancel</button><button className="primary" disabled={!newName.trim()} onClick={addFolder}>Create</button></>}>
          <label className="stack">Folder name<input data-autofocus maxLength={15} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFolder()} /></label>
        </Modal>
      )}
      {dlg === "delfolder" && (
        <Modal title={`Delete folder “${folder}”?`} onClose={() => setDlg(null)} actions={<><button onClick={() => setDlg(null)}>Cancel</button><button onClick={() => removeFolder(false)}>Folder only</button><button className="danger" onClick={() => removeFolder(true)}>Folder and files</button></>}>
          <p>“Folder only” moves its programs to the default folder. “Folder and files” deletes them from the controller.</p>
        </Modal>
      )}
      {dlg === "delfiles" && (
        <Confirm title={`Delete ${sel.length} program${sel.length > 1 ? "s" : ""}?`} danger confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={() => removeFiles(sel)}>
          <p>They will be removed from the controller. This can't be undone.</p><ul className="plain">{sel.slice(0, 8).map((n) => <li key={n}>{n}</li>)}{sel.length > 8 && <li>and {sel.length - 8} more</li>}</ul>
        </Confirm>
      )}
    </div>
  );
}
