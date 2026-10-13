# Runs the Measure stock program from measure.js against a simulated machine
# (stock, vise jaws, clamps) and checks the size, the zero and every stop.
#   python3 src/react-ui/test/measure-sim.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from simlib import *

def run(name, opts, start, r, obs, expect):
    try:
        sim = Sim(start, r, obs).run(gen(opts)); res = 'ok' if sim.vars.get('_ofm_ok')==1 else 'fail %d' % sim.vars.get('_ofm_fail',-1)
    except (Crash, NotFound) as e: sim=None; res = type(e).__name__+': '+str(e)
    ok = res.startswith(expect)
    print(('PASS' if ok else 'FAIL'), name, '->', res)
    return sim, ok

stock = (0,100, 0,60, 0,20)     # x 0..100, y 0..60, top Z 20
jawF  = (-30,130, -20,0, 0,25)  # vise jaws taller than stock, along front/back faces
jawB  = (-30,130, 60,80, 0,25)
allok = True
def chk(name, cond, msg):
    global allok
    print(('  ok ' if cond else '  BAD'), name, msg); allok &= cond

# 1. X only, ball r=1 configured correctly, centre origin; start off-centre by a few mm
sim, ok = run('X only, centre', dict(w=96, probeY=False, origin='center-x', ball=2), (55,30,27), 1.0, [stock], 'ok'); allok&=ok
w = sim.work(); edge_x_work = 50 - sim.off[0] + 0  # machine x of centre is 50
chk('width', abs(sim.vars['_ofm_w']-100)<0.01, sim.vars['_ofm_w'])
chk('X0 on centre', abs((50 - sim.off[0]))<0.01, 50 - sim.off[0])
chk('Z0 on top', abs((20 - sim.off[2]))<0.01, 20 - sim.off[2])
chk('parked over X0', abs(w[0])<0.01, w)
# 2. XY, front-left corner, typed size off by 6 mm
sim, ok = run('XY, front-left', dict(w=106, l=55, probeY=True, origin='front-left', ball=2), (48,33,30), 1.0, [stock], 'ok'); allok&=ok
chk('size', abs(sim.vars['_ofm_w']-100)<0.01 and abs(sim.vars['_ofm_l']-60)<0.01, (sim.vars['_ofm_w'], sim.vars['_ofm_l']))
chk('X0Y0 on front-left', abs(0-sim.off[0])<0.01 and abs(0-sim.off[1])<0.01 and abs(20-sim.off[2])<0.01, sim.off)
# 3. back-right and centre
for org, ex in (('back-right',(100,60)),('center',(50,30)),('back-left',(0,60)),('front-right',(100,0))):
    sim, ok = run('XY '+org, dict(w=100, l=60, probeY=True, origin=org, ball=2), (52,28,25), 1.0, [stock], 'ok'); allok&=ok
    chk(org, abs(ex[0]-sim.off[0])<0.01 and abs(ex[1]-sim.off[1])<0.01, sim.off)
# 4. stock much bigger than typed -> drop lands on top
run('typed 20 mm too small', dict(w=80, probeY=False, origin='center-x', ball=2), (50,30,27), 1.0, [stock], 'fail 2')
# 5. vise jaws taller than stock with Y faces -> fail 7, X only works
run('jaws above travel height, Y faces', dict(w=100, l=60, probeY=True, origin='center', ball=2), (50,30,28), 1.0, [stock,jawF,jawB], 'fail 6')
jF2=(-30,130,-20,0,0,22); jB2=(-30,130,60,80,0,22)
run('jaws between top and travel height', dict(w=100, l=60, probeY=True, origin='center', ball=2), (50,30,28), 1.0, [stock,jF2,jB2], 'fail 7')
clamp = (-25,-5, 20,40, 0,40)
run('clamp in the way', dict(w=100, probeY=False, origin='center-x', ball=2), (50,30,27), 1.0, [stock,clamp], 'fail 1')
# 7. stock narrower than typed by more than margin -> edge not found (controller E-stops)
run('typed 25 mm too big', dict(w=125, probeY=False, origin='center-x', ball=2), (50,30,27), 1.0, [stock], 'NotFound')
# 8. calibration: true ball 2 mm, configured 0, no zero change
sim, ok = run('calibrate', dict(w=100, probeY=False, origin='center-x', ball=0, calibrate=True), (50,30,27), 1.0, [stock], 'ok'); allok&=ok
ball = abs(sim.vars['_ofm_rxb']-sim.vars['_ofm_rxa']) - 100
chk('ball from calibration', abs(ball-2)<0.01, ball); chk('zero untouched', sim.off==[0,0,0], sim.off)
# 9. start too high (>25 mm above top)
run('start too high', dict(w=100, probeY=False, origin='center-x', ball=2), (50,30,50), 1.0, [stock], 'NotFound')
run('start 20 above top, offset', dict(w=100, probeY=False, origin='center-x', ball=2), (50,30,40), 1.0, [stock], 'ok')
print('ALL OK' if allok else 'SOMETHING FAILED')
