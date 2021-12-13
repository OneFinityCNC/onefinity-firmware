#!/usr/bin/env python3
import sqlite3

db = sqlite3.connect('/home/pi/.config/chromium/Default/Cookies')
cur = db.cursor()
cur.execute("DELETE FROM cookies WHERE creation_utc < 13240000000000000")
db.commit()
