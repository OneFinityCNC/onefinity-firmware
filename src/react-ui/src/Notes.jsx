import React, { useEffect, useRef, useState } from "react";
import { getNote, setNote, useNote } from "./notes.js";

export default function Notes({ file }) {
  const [v, setV] = useState(() => getNote(file));
  const ref = useRef(null);
  const stored = useNote(file);
  useEffect(() => setV(getNote(file)), [file]);
  // Take a newer note from another device, but never overwrite what is being typed here.
  useEffect(() => { if (document.activeElement !== ref.current) setV(stored); }, [stored]);
  if (!file) return <p className="empty">Pick a program in Files to write notes about it.</p>;
  return (
    <div className="notes-pane">
      <label htmlFor="note">Notes for <b>{file}</b></label>
      <textarea id="note" ref={ref} rows="10" value={v} placeholder="Bit, speeds, stock, work zero, fixture. Anything you want to see before you run it again."
        onChange={(e) => { setV(e.target.value); setNote(file, e.target.value); }} />
      <p className="note">Saved on the controller, so every device sees it. The first line shows in the Job panel.</p>
    </div>
  );
}
