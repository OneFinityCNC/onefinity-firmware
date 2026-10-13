// Front-panel setup notes for each supported VFD, ported from the classic Tool page.
export const VFD_NOTES = [
 {
  "kind": "eq",
  "key": "HUANYANG VFD",
  "rows": [
   [
    "PD000",
    "0",
    "Unlock",
    "Unlock parameters"
   ],
   [
    "PD001",
    "2",
    "RS485",
    "Command source"
   ],
   [
    "PD002",
    "2",
    "RS485",
    "Speed/frequency source"
   ],
   [
    "PD163",
    "1",
    "Modbus ID",
    "Must match #[tt bus-id] above."
   ],
   [
    "PD164",
    "1",
    "9600 baud",
    "Must match #[tt baud] above."
   ],
   [
    "PD165",
    "3",
    "8 bit, no parity, RTU mode",
    "Must match #[tt parity] above."
   ]
  ],
  "href": "https://buildbotics.com/upload/vfd/Huanyang-VFD-manual.pdf",
  "link": "Huanyang VFD manual",
  "extra": ""
 },
 {
  "kind": "starts",
  "key": "NOWFOREVER VFD",
  "rows": [
   [
    "P0-000",
    "2",
    "Modbus communication",
    "Command source"
   ],
   [
    "P0-001",
    "0",
    "Main frequence X",
    "Select frequency source"
   ],
   [
    "P0-002",
    "6",
    "Modbus communication",
    "Main frequency X"
   ],
   [
    "P0-055",
    "1",
    "Modbus ID",
    "Must match #[tt bus-id] above"
   ],
   [
    "P0-056",
    "2",
    "9600 baud",
    "Must match #[tt baud] above"
   ],
   [
    "P0-057",
    "0",
    "1 start, 8 data, no parity, 1 stop",
    "Must match #[tt parity] above"
   ]
  ],
  "href": null,
  "link": null,
  "extra": ""
 },
 {
  "kind": "starts",
  "key": "DELTA VFD015M21A",
  "rows": [
   [
    "Pr.00",
    "3",
    "RS-485",
    "Source of frequency command"
   ],
   [
    "Pr.01",
    "3",
    "RS-485 with STOP",
    "Source of operation command"
   ],
   [
    "Pr.88",
    "1",
    "Modbus ID",
    "Must match #[tt bus-id] above"
   ],
   [
    "Pr.89",
    "1",
    "9600 baud",
    "Must match #[tt baud] above"
   ],
   [
    "Pr.92",
    "3",
    "8 bit, no parity, RTU mode",
    "Must match #[tt parity] above"
   ],
   [
    "Pr.157",
    "1",
    "Modbus mode",
    "Communication mode"
   ]
  ],
  "href": "https://buildbotics.com/upload/vfd/Delta_VFD015M21A.pdf",
  "link": "Delta VFD015M21A VFD manual",
  "extra": ""
 },
 {
  "kind": "starts",
  "key": "YL600",
  "rows": [
   [
    "P00.01",
    "3",
    "Modbus RS-485",
    "Start / stop command source"
   ],
   [
    "P03.00",
    "3",
    "9600 baud",
    "Must match #[tt baud] above"
   ],
   [
    "P03.01",
    "1",
    "Modbus ID",
    "Must match #[tt bus-id] above"
   ],
   [
    "P03.02",
    "5",
    "8 bit, no parity, 2 stop",
    "Must match #[tt parity] above"
   ],
   [
    "P03.04",
    "500",
    "RS-485 max delay",
    "Time in milliseconds"
   ],
   [
    "P07.15",
    "5",
    "RS-485",
    "Frequency source"
   ]
  ],
  "href": "https://buildbotics.com/upload/vfd/YL620-A.pdf",
  "link": "YL600 VFD manual",
  "extra": ""
 },
 {
  "kind": "starts",
  "key": "SUNFAR",
  "rows": [
   [
    "F0.0",
    "2",
    "Serial communication",
    "Frequency source"
   ],
   [
    "F0.2",
    "1002",
    "Serial communication",
    "Control source"
   ],
   [
    "F4.0",
    "0104",
    "Modbus, no parity, 9600 baud",
    "Must match #[tt parity] and #[tt baud] above"
   ],
   [
    "F4.1",
    "1",
    "Bus ID",
    "Must match #[tt bus-id] above"
   ],
   [
    "F4.4",
    "3",
    "Seconds",
    "Communication timeout"
   ]
  ],
  "href": "https://buildbotics.com/upload/vfd/Sunfar-E300.pdf",
  "link": "Sunfar E300 VFD manual",
  "extra": ""
 },
 {
  "kind": "starts",
  "key": "OMRON",
  "rows": [
   [
    "C071",
    "5",
    "9600 BAUD",
    "Must match #[tt baud] above"
   ],
   [
    "C072",
    "1",
    "Bus ID 1",
    "Must match #[tt bus-id] above"
   ],
   [
    "C074",
    "0",
    "No parity",
    "Must match #[tt parity] above"
   ],
   [
    "C075",
    "2",
    "2 stop bits",
    "Serial stop bits"
   ],
   [
    "C076",
    "4",
    "Deceleration stop",
    "Communication error action"
   ],
   [
    "C077",
    "500",
    "0.5 seconds",
    "Communication error timeout"
   ],
   [
    "C078",
    "1",
    "1 milisecond",
    "Communication wait time"
   ],
   [
    "C096",
    "0",
    "Modbus-RTU",
    "Communication mode"
   ],
   [
    "P200",
    "0",
    "Standard",
    "Modbus mapping"
   ],
   [
    "P400",
    "0",
    "Big endian",
    "Communication byte order"
   ]
  ],
  "href": "https://buildbotics.com/upload/vfd/omron_i570_mx2.pdf",
  "link": "OMRON MX2 VFD manual",
  "extra": "The VFD must be rebooted after changing  the above settings."
 },
 {
  "kind": "starts",
  "key": "V70",
  "rows": [
   [
    "F001",
    "2",
    "Communication port",
    "Control mode"
   ],
   [
    "P0.0.04",
    "9",
    "Modbus",
    "Frequency source A"
   ],
   [
    "P0.1.00",
    "0",
    "Source A",
    "Frequency source"
   ],
   [
    "P4.1.00",
    "3",
    "9600 BAUD",
    "Must match #[tt baud] above"
   ],
   [
    "F002",
    "2",
    "Communication port",
    "Frequency setting selection"
   ],
   [
    "F163",
    "1",
    "Slave address",
    "Must match #[tt bus-id] above"
   ],
   [
    "F164",
    "1",
    "9600 BAUD",
    "Must match #[tt baud] above"
   ],
   [
    "F165",
    "3",
    "8 data, no parity, 1 stop, RTU",
    "Must match #[tt parity] above"
   ]
  ],
  "href": "https://buildbotics.com/upload/vfd/stepperonline-v70.pdf",
  "link": "V70 VFD manual",
  "extra": ""
 }
];
