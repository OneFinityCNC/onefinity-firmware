import React, { useState } from "react";
import sheet from "./cheatsheet.html?raw";
import { Page, Group } from "./ui.jsx";

export function CheatSheet() {
  const [all, setAll] = useState(false);
  return (
    <Page title="G-code cheat sheet" actions={<label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show unsupported codes</label>}>
      <div className={`cheat${all ? " show-unimpl" : ""}`} dangerouslySetInnerHTML={{ __html: sheet }} />
    </Page>
  );
}

export function Help({ cfg, net }) {
  const c = cfg.config;
  return (
    <Page title="Help">
      <div className="cols">
        <div>
          <Group title="Support and contact">
            <p>Visit <a href="https://onefinitycnc.com/support" target="_blank" rel="noreferrer">onefinitycnc.com/support</a> for support resources and contact information.</p>
          </Group>
          <Group title="Discussion forum">
            <p>Our support and discussion forum is at <a href="https://forum.onefinitycnc.com" target="_blank" rel="noreferrer">forum.onefinitycnc.com</a>. Register on the site and post a message.</p>
            <p>There is also a list of <a href="https://forum.onefinitycnc.com/t/what-cad-cam-software-can-be-used-to-make-gcode-files-for-the-onefinity-cnc/10253" target="_blank" rel="noreferrer">CAD/CAM software that makes G-code for the Onefinity</a>.</p>
          </Group>
        </div>
        <div>
          <Group title="This controller">
            <dl className="stats one">
              <div className="stat"><dt>Firmware</dt><dd>{c ? `v${c.full_version}` : "—"}</dd></div>
              <div className="stat"><dt>IP address</dt><dd>{net.ip || "—"}</dd></div>
              <div className="stat"><dt>Wi-Fi</dt><dd>{net.wifi || "—"}</dd></div>
            </dl>
          </Group>
        </div>
      </div>
    </Page>
  );
}
