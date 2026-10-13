import React from "react";

export default function Messages({ logs, clear }) {
  return (
    <div className="messages">
      <div className="files-head"><button onClick={clear} disabled={!logs.length}>Clear</button><span className="dim">{logs.length} message{logs.length === 1 ? "" : "s"} since this page opened</span></div>
      {logs.length === 0 ? <p className="empty">Nothing logged yet. Controller messages and errors show up here.</p> : (
        <table className="grid-table log"><tbody>
          {logs.map((m) => <tr key={m.id} className={`lvl-${m.level}`}><th>{m.level}</th><td>{m.msg}{m.repeat > 1 ? <small> ×{m.repeat}</small> : null}</td></tr>)}
        </tbody></table>
      )}
    </div>
  );
}
