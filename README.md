# Onefinity Firmware (Mike Smith's fork)

A fork of the [Onefinity CNC controller firmware](https://github.com/OneFinityCNC/onefinity-firmware) (itself based on Buildbotics `bbctrl`) with extra features for day-to-day machining. It runs on the Raspberry Pi inside the Onefinity controller and is installed from the controller's own web interface.

## What this fork adds

| Feature | Since | What it does |
|---|---|---|
| Corner, center and center-X probing | 1.6.7 | The probe dialog finds a stock corner, the center of a piece, or the center in X only. It remembers the measured stock size. |
| Depth view | 1.7.0 | Simulates cut depth under the tool path, with a play slider. It also works on controllers without WebGL. |
| Mist off on pause | 1.7.0 | Mist turns off while a job is paused and comes back on resume. |
| New UI | 1.8.0 (at `/next`), main interface from 1.20.0 | A React interface where every page is a tab across the top: Control, Macros, Settings, Motors, Tool, I/O, Admin, Cheat sheet, Help. |
| VFD register editor | 1.11.0 | The Tool tab shows the active Modbus program, lets you customize or clear it for a custom VFD, and shows the front-panel setup notes for each supported VFD. |
| Hold-to-jog | 1.11.0 | Choose Step or Hold in the jog pad. In Hold mode the machine moves while you hold a key, at 1 to 100% of max speed. The controller stops the jog by itself if the page stops sending updates. |
| Run checklist | 1.11.0 | Pressing Run shows homing, fit, work zero and spindle drive status first. Can be turned off per device. |
| Connection drop log | 1.11.0 | Admin shows each time the page lost its link to the controller, with how long and why. |
| Plain-language errors | 1.12.0 | E-stop and error messages come with what happened and what to do next. Messages the controller sends that aren't recognized are shown unchanged. |
| Remembered Depth view settings | 1.12.0 | Tool diameter, shape and stock top are remembered per program file. |
| Tool-change helper | 1.13.0 | The Job panel shows the next tool change in the program (tool, line, and which of how many). When a tool-change message stops the job, the pop-up says which tool to install. |
| Run history, file notes, camera snapshot | 1.14.0 | A History tab lists each run with time and result (finished, stopped or E-stop). A Notes tab keeps a note per program, with its first line shown in the Job panel. The Camera tab can save a snapshot to your PC. In 1.15.0 history and notes are saved on the controller, so every device and browser sees the same ones. |
| Power-loss recovery, stage 1 | 1.16.0 | While a job runs the controller saves the program and line number (about every 10 seconds, only when the line changes, off the motion path). After a power loss or E-stop the Control tab shows the interrupted job and the line. Can be turned off in Admin. Resuming the job comes in a later version. |
| Updates from this repo | 1.16.1 | Admin > Check for upgrade and Upgrade via web now look at the latest release of this repository (not the stock Onefinity one), download the package, test it is not corrupt, then install it. |
| Resume and park, stages 2 and 3 | 1.17.0 | **Resume**: after a power loss, E-stop or stop, home the machine and press Resume on the Control tab. It writes a program that lifts Z, moves over the point where the job stopped, waits for you to check it, starts the spindle, waits for it to reach speed, lowers slowly and carries on from the saved line. **Park**: while a job runs, Park stops it, turns the spindle off and lifts Z to the top so you can switch the machine off and finish the cut later, even after a firmware update. Spin-up wait and plunge speed are settings in Admin. |
| Works on the controller's own screen | 1.17.1 | The new UI is now built for the older Chromium on the controller's built-in display (it showed a blank page before). Spacing fallbacks added for old browsers, and if the UI can't start it now says why and says why. |
| Compatibility build for old screens | 1.17.2 | The new UI now ships with a compatibility version for very old browsers (Chromium 49 and later) that is used automatically when the browser can't run the normal one. |
| Macro buttons report problems | 1.17.3 | A macro button waits until the controller has loaded the macro file before starting it, stays armed for 5 seconds after the first tap, and shows an error under the buttons if the macro could not start. |
| Dry run | 1.18.0 | Tick Dry run next to Run to rehearse the selected program in the air. The controller plans the program unchanged and sends every move higher (30 mm by default, 5 to 100 mm allowed) with the router, mist and probing blocked. Nothing is stored: no Z offset is changed, the lift lasts for that one run only, and a banner shows while it is active. Needs Z homed. |
| Setup sheet | 1.19.0 | Programs can carry `(SETUP key: text)` comment lines near the top (stock size, where zero goes, tool, speeds, probe corner). The Run checklist shows them, the Job panel has a Setup sheet button, the program is checked against the declared plate, and the corner last probed is compared with the corner the sheet needs. Controllers treat the lines as comments. |
| New UI is the only UI | 1.20.0 | The React interface is now served at the controller's main address. The original interface is no longer shipped, and the "Classic UI" and "Try the new UI" buttons are gone. Old `/next/` bookmarks redirect to `/`. |
| Resume fix for numbered programs | 1.20.1 | The resume program builder put `G1` in front of the line number (`G1 N10 X1`) when the first resumed line was a continuation of a Fusion-style program (lines numbered N10, N15, ...). The line number now stays first. |
| Resume finds the tool | 1.21.0 | Resume now checks where the tool is. If it is still on the program's path (for example after a stop with the machine still homed), the restart point is the earliest matching move at or after the saved line, so a saved line that lags the machine no longer makes it re-cut a long stretch. After a power loss the tool is away from the path and the saved line is used as before. A program edited after the interruption (a fixed comment, say) can be resumed when the tool's position confirms the restart point. |
| Bit diameter picker | 1.21.1 | In the probe dialog, Cutter diameter is a dropdown with 1/8 in and 1/4 in, plus Other size to type a measurement (3/16", 6 mm, 0.25 in). Dialogs no longer move focus on every keystroke, so the on-screen keyboard stays put and deleted text stays deleted. |
| Clear stop for wrong zero | 1.21.2 | A program whose setup sheet needs zero on one corner now shows a red banner in the Job panel the moment it is loaded if your last probe was on a different corner. Run and Dry run both stop with a large red message that names both corners, and Run anyway stays disabled until you tick a box saying you mean it. Dry run used to skip every check; it now stops for red items. |
| Dry run lift field edits properly | 1.21.3 | The dry run lift box sat inside the Dry run label, so tapping it could toggle the tick-box and the on-screen keyboard fought the field. It is now its own field: tap, type, and it keeps focus. Values are kept between 5 and 100 mm. |
| Camera alignment | 1.22.0 | Put a USB camera on the toolhead and use the Camera tab to line a program up with a part that is already cut (a logo or engraving on a finished part). Calibrate the camera's offset from the router or laser once (mark a spot with the tool, then put the crosshair on it; kept per tool). Then put the crosshair on the part's X0 Y0 point and on a second point along its X or Y edge. The controller sets X/Y zero on point 1 and writes a copy of the loaded program rotated to match the edge (`aligned-<name>`). Points are kept in machine coordinates, so the camera can come off before cutting. Focus can be locked so it can't drift. Programs that set offsets inside themselves (G10, G52, G92), use XZ/YZ arcs or expressions in X/Y/I/J are refused rather than rotated. |
| Measure stock | 1.23.0 | **Measure stock** next to the probe buttons measures the stock with a 3D touch probe (a stylus probe in the collet, wired to the probe input like the touch plate, normally open). Jog the stylus over the middle of the stock, type the approximate size (filled in from the setup sheet when the program has one), and it touches the top, drops beside each end and touches it, and optionally the front and back faces. It shows the real size and sets Z zero on the top and X/Y on the center or a chosen corner (or X only, keeping Y from the fixed jaw). Every move with the probe in is guarded: touching a clamp, a jaw or stock bigger than typed stops the routine without changing zero. **Calibrate stylus** measures a block of known width to learn the stylus ball's effective size. After measuring, put the cutter in and use Probe Z. |
| Tool setter, normally-closed probes | 1.24.0 | **Tool setter** next to the probe buttons: save where the setter sits once (machine coordinates), take a reference with a tool whose Z zero is right, then press **Measure tool** after every tool change and Z zero follows the new tool, with no touch plate. Measure stock takes the reference automatically with the 3D probe when the setter is set up. The move down to the setter is guarded, so a tool much longer than expected stops instead of crashing. The reference is refused once Z zero has been changed some other way. All probe screens now read the probe input correctly when it is set to **normally closed** (the input reports the raw pin), and refuse to move while the input reads as touched, which with normally-closed wiring also catches an unplugged probe or setter. Wire normally-closed devices in series; the touch plate (normally open) can't share the input. |
| Depth view tool from the setup sheet | 1.25.0 | A program's setup sheet can carry `(SETUP tool-geom: flat 6.35)` or `(SETUP tool-geom: v 6.35 90)` (shape, diameter in mm, included angle for a V-bit or chamfer mill). The Depth view then fills in Tool diameter, Shape and Angle by itself when the program is opened, and says so. Values you type are remembered for that program and win over the sheet; **Use setup sheet tool** puts the sheet's tool back. Settings saved by earlier versions no longer override a sheet. Also fixed: the red WRONG ZERO banner in the Job panel could keep showing the corner from before you probed, because it re-checked while the offsets were changing during probing, before the new probe was saved. It now re-checks as soon as a probe is saved, and every few seconds while a warning shows. The Run check itself was not affected. **Probing needs a homed machine:** Probe XYZ, Probe Z, Probe center, Measure stock and Tool setter now show a Home step first when any axis is not homed (for example after a firmware update or restart), because a zero probed before homing lands in the wrong place once the machine is homed. Home now homes the machine and the probe opens by itself when homing finishes. **Dry run lift buttons:** the lift is set with − and + buttons in 5 mm steps (5 to 100 mm) instead of a typed field, so it works without a keyboard on the controller's touch screen. |

The interface is at `http://<controller-address>/`. The original Onefinity interface is not included from 1.20.0. To go back to it, install an earlier release (1.19.0 or older).

## Download the latest firmware to your PC

Firmware packages are single files named `onefinity-X.Y.Z.tar.bz2` (a fix to a release adds `-pN`, for example `onefinity-1.6.7-p10.tar.bz2`).

1. On your PC, open the [Releases page](https://github.com/mikejsmith1985/onefinity-firmware/releases).
2. Open the newest release (the top one, not marked pre-release).
3. Under **Assets**, click the `onefinity-X.Y.Z.tar.bz2` file to download it.
   - Do **not** use "Source code (zip)" or "Source code (tar.gz)". Those are the source files, not an installable package.
   - Do **not** extract the `.tar.bz2`. The controller installs it as is.
4. Keep the file somewhere easy to find, such as your Downloads folder.

Command-line alternative, if you use the GitHub CLI:

    gh release download --repo mikejsmith1985/onefinity-firmware --pattern "onefinity-*.tar.bz2"

Optional check that the download is intact (a damaged file prints an error):

    tar tjf onefinity-X.Y.Z.tar.bz2 > /dev/null

## Install it on the controller

1. Connect your PC to the same network as the controller and open its address in a browser (the IP address is shown on the controller's screen and in the Admin tab).
2. Make sure the machine is idle and nothing is running.
3. Go to **Admin → General → Firmware** and choose **Upgrade from file**.
4. Select the `onefinity-X.Y.Z.tar.bz2` you downloaded and confirm.
5. Wait for the upgrade to finish. It should take under 5 minutes. If it takes longer, restart the controller and try again, or install from a USB stick.
6. Reload the page. The version shown in the tab bar should match the file you installed.

Your settings and macros are kept. You can still back them up first from **Admin → General → Configuration → Back up**.

To go back to an older version, install that version's package the same way.

## Release status

Release packages are published on the Releases page above. If a version you expect isn't there, it hasn't been published yet.

## Build from source

Development is supported on Debian Linux only. See [docs/development.md](docs/development.md) for the full setup. In short:

    git clone https://github.com/mikejsmith1985/onefinity-firmware
    cd onefinity-firmware
    make pkg          # writes dist/onefinity-<version>.tar.bz2

The new UI lives in `src/react-ui/`:

    cd src/react-ui
    npm install
    npm run build     # writes to src/resources/next/ (served at /)
    npm run mock      # fake controller on :8080 that also serves the UI at /

Version numbers are set in `package.json` and `src/py/bbctrl/Config.py`. A new feature is a version bump (1.9.0 to 1.10.0). A fix is a `-pN` suffix.

## Known limitations of the new UI

- Hold-to-jog has not been tested on a real machine. Test it at 1% first with the tool well above the work.
- The old 3D path viewer is replaced by the Depth view and a 2D tool-path view.
- The VFD register editor has not been tried against a real VFD.
- Camera, camera alignment, Measure stock, the tool setter and probing in the new UI have not been tested on real hardware. `src/react-ui/test/measure-sim.py` and `setter-sim.py` run the probing programs against a simulated machine.

## Camera

Any USB UVC webcam that outputs MJPEG works, from `/dev/video0`. The default is 640×480 at 15 fps. Change it with the `--width`, `--height` and `--fps` flags when `bbctrl` starts (see `scripts/bbctrl.service`). A Logitech C920 works; for alignment, tick Lock focus in the Camera tab once the image is sharp at your working height, so the focus can't wander.

## Credits and licence

Based on the Buildbotics controller firmware and the Onefinity fork of it. See [LICENSE](LICENSE) and [CHANGELOG.md](CHANGELOG.md).
