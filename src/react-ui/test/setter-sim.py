# Measure stock with the 3D probe, reference the tool setter with it, change
# to a cutter of a different length and measure that on the setter.  Checks
# that Z zero ends up on the stock top for the cutter, and the safety stops.
#   python3 src/react-ui/test/setter-sim.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from simlib import *

stock  = (0, 100, 0, 60, 0, 20)        # top of stock at machine Z 20
setter = (147, 153, 22, 28, 0, 5)      # setter button, top at machine Z 5
TOP = 120
SET = dict(x=150, y=25, z=10)           # saved with the probe tip 5 mm above the button
allok = True

def check(name, cond, msg=''):
    global allok
    print(('PASS ' if cond else 'FAIL ') + name, msg); allok &= bool(cond)

def setter_prog(mode, ref=None, clear=30, back=(50, 30)):
    o = dict(mode=mode, setter=SET, top=TOP, clear=clear, travel=1000, back=dict(x=back[0], y=back[1]))
    if ref is not None: o['ref'] = ref
    return gen(o, 'setter.js', 'setterProgram')

def flow(cutter_longer_by, clear=30):
    sim = Sim((52, 28, 26), 1.0, [stock, setter])
    sim.run(gen(dict(w=100, probeY=True, l=60, origin='front-left')))
    assert sim.vars['_ofm_ok'] == 1
    sim.P[2] = TOP
    sim.run(setter_prog('ref'))
    ref = sim.vars['_ofs_ref']
    # tool change: the cutter sticks out further, so its tip is lower
    sim.L += cutter_longer_by; sim.r = 0.01
    sim.run(setter_prog('tool', ref=ref, clear=clear))
    return sim, ref

sim, ref = flow(12.7)
check('reference taken with the probe', sim.vars['_ofs_ok'] == 1, 'ref work Z %.3f' % ref)
# with the cutter, its tip is on the stock top (Z 20) when the machine is at 20 + L, which must read work Z 0
check('cutter 12.7 mm longer: Z0 on the stock top', abs(sim.off[2] - (20 + sim.L)) < 0.01, 'offset Z %.3f, expected %.3f' % (sim.off[2], 20 + sim.L))
check('X/Y zero untouched by the setter', abs(sim.off[0]) < 0.01 and abs(sim.off[1]) < 0.01, sim.off)
check('returned to the start point', abs(sim.P[0] - 50) < 0.01 and abs(sim.P[1] - 30) < 0.01, sim.P)

sim, _ = flow(-20)
check('cutter 20 mm shorter: Z0 on the stock top', abs(sim.off[2] - (20 + sim.L)) < 0.01, 'offset Z %.3f, expected %.3f' % (sim.off[2], 20 + sim.L))

sim, _ = flow(40, clear=30)
check('cutter 40 mm longer than clearance: guarded stop', sim.vars['_ofs_fail'] == 1 and sim.vars['_ofs_ok'] == 0, 'fail=%s' % sim.vars['_ofs_fail'])
check('Z zero unchanged after that stop', abs(sim.off[2] - 20) < 0.01, 'offset Z %.3f (still the probe\'s)' % sim.off[2])

try:
    sim = Sim((150, 25, TOP), 1.0, [stock]); sim.run(setter_prog('ref'))
    check('setter missing: edge search stops the machine', False)
except NotFound:
    check('setter missing: edge search stops the machine', True)

print('ALL OK' if allok else 'SOMETHING FAILED')
