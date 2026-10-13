// Plain-language help for controller errors. The patterns match the controller's own status
// messages (src/avr/src/messages.def) plus a few common planner phrases. Anything unmatched is
// shown unchanged, with no advice.
const RULES = [
  [/user.*e-?stop/i, "You pressed E-stop.", "Make sure the machine and work area are safe, then click Clear E-stop. If the axes moved while stopped, re-home before cutting."],
  [/switch.*e-?stop/i, "The E-stop switch is pressed or its wiring is open.", "Release the switch and check its cable and connector. Then click Clear E-stop. If it keeps tripping, check the E-stop setting on the I/O tab."],
  [/power shutdown/i, "The controller shut down because of a power problem.", "Check the power supply and its connections. The I/O tab shows power faults. Click Clear E-stop once the supply is stable."],
  [/motor fault/i, "A stepper driver reported a fault (over-temperature, overcurrent or a driver error).", "Open Control, then Indicators to see which motor. Check its wiring and that the machine isn't binding or jammed. Reset the fault there, then Clear E-stop. Repeated faults can mean the drive current in Motors is too high."],
  [/machine alarmed/i, "The machine is stopped by an alarm and ignored that command.", "Clear E-stop first, then try the command again."],
  [/switch not found/i, "A homing search ended without finding the limit switch.", "Check that the axis can travel freely, the switch is wired and working, and the homing mode on the Motors tab matches your machine."],
  [/switch not enabled/i, "The command needs a switch that is turned off.", "Enable the switch on the Motors or I/O tab, or change the homing mode."],
  [/(queue|q) (overrun|underrun)|invalid command (in|pushed to) queue|null move|long segment time|not ready for move|not prepped|internal error/i, "The controller board and the Pi lost sync.", "Click Clear E-stop and run the job again. If it repeats, save a bug report from Admin and include the file you were running."],
  [/soft.?limit|out of (range|bounds)|exceeds? (the )?(travel|limit)/i, "A move would go outside the axis travel.", "Check where work zero is set and re-home. The Fit line in the Run check shows which axis is over or under."],
  [/not homed|unhomed|home first/i, "An axis needs homing before this move.", "Home the machine first. Positions and soft limits aren't reliable until it is homed."],
  [/probe/i, "Probing did not finish as expected.", "Check the probe clip, that the probe block is under the bit, and that the Probe switch setting on the I/O tab is right. Then try again."],
  [/stall/i, "A motor stalled.", "Check for a jam or a dull bit and slow the feed. Lowering max velocity or acceleration on the Motors tab can help."],
  [/modbus|vfd/i, "The spindle drive isn't answering as expected.", "Check the VFD's power and RS-485 wiring. The VFD settings on the Tool tab must match the drive's front-panel settings."],
];

export function explain(text) {
  const t = String(text || "");
  for (const [re, what, advice] of RULES) if (re.test(t)) return { what, advice };
  return null;
}
