import os
import re
import math

# Camera alignment: rotate a program in the XY plane so it lines up with a
# part that sits at an angle on the table.
#
# The operator captures the part's reference point (the program's X0 Y0) and
# a second point along one of its edges with the camera crosshair.  The new UI
# works out the angle from those two points, sets the X/Y work zero on the
# first point and asks the controller for a rotated copy of the program.
#
# The rotation is about the program's own X0 Y0, so it never needs to know
# where the part is on the table: the work offset does the moving.  Z and
# every other word are left alone.  Anything that can't be rotated safely
# (arcs outside the XY plane, offsets set inside the program, expressions in
# X/Y/I/J) stops the conversion with a message instead of producing a program
# that cuts in the wrong place.


class AlignError(Exception): pass


PREFIX = 'aligned-'
MAX_ANGLE = 45.0
COMMENT = re.compile(r'\([^)]*\)|;.*$')
WORD = re.compile(r'([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))')
REJECT_G = {
    10: 'G10 (sets offsets or tool tables inside the program)',
    52: 'G52 (local offset)',
    68: 'G68 (coordinate rotation)',
    92: 'G92 (sets the work position inside the program)',
}


def fmt(v, places):
    s = ('%.*f' % (places, v)).rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def _split(line):
    """Code part of a line and its comments (kept verbatim, moved to the end)."""
    comments = [m.group(0) for m in COMMENT.finditer(line)]
    code = COMMENT.sub(' ', line)
    return code, comments


def transform(lines, angle_deg, source = '', max_angle = MAX_ANGLE):
    """Rotate every XY position (and arc centre offset) about X0 Y0.

    Returns (text, info).  Raises AlignError when the program can't be
    rotated safely.
    """
    if not isinstance(angle_deg, (int, float)) or not math.isfinite(angle_deg):
        raise AlignError('The angle is not a number.')
    if abs(angle_deg) > max_angle:
        raise AlignError('%.2f degrees is too far to be a part sitting crooked '
                         'in the vise. Check that point 2 is along the edge '
                         'you picked, in the program\'s + direction.'
                         % angle_deg)

    a = math.radians(angle_deg)
    c, s = math.cos(a), math.sin(a)
    rot = lambda x, y: (x * c - y * s, x * s + y * c)

    absolute = True         # G90 / G91
    arc_abs = False         # G90.1 / G91.1 (Buildbotics default: incremental)
    plane = 17
    inch = False
    pos = [None, None]      # last X/Y in the program's own (unrotated) coords
    motion = None
    moved = 0
    out = []

    for n, raw in enumerate(lines, 1):
        def fail(msg):
            raise AlignError('Line %d: %s\n    %s' % (n, msg, raw.strip()))

        code, comments = _split(raw)
        stripped = code.strip()
        if not stripped or stripped.startswith('%'):
            out.append(raw)
            continue

        words = [(m.group(1).upper(), m.group(2), m.start(), m.end())
                 for m in WORD.finditer(code)]
        letters = {w[0] for w in words}
        has_xy = 'X' in letters or 'Y' in letters
        has_ij = 'I' in letters or 'J' in letters

        # Expressions and parameters ([..], #5061) can't be rotated as text
        if re.search(r'[XYIJxyij]\s*[\[#]', code):
            fail('X, Y, I or J is an expression or parameter, which this '
                 'conversion can\'t rotate.')

        gs = []
        for L, v, _, _ in words:
            if L == 'G': gs.append(round(float(v), 1))

        machine_coords = False
        home_move = False
        for g in gs:
            gi = int(g)
            if g == int(g) and gi in REJECT_G:
                fail('%s. Remove it or set zero on the machine instead.'
                     % REJECT_G[gi])
            if gi == 92: fail(REJECT_G[92])
            if g == 90: absolute = True
            elif g == 91: absolute = False
            elif g == 90.1: arc_abs = True
            elif g == 91.1: arc_abs = False
            elif g in (17, 18, 19): plane = gi
            elif g == 20: inch = True
            elif g == 21: inch = False
            elif g == 53: machine_coords = True
            elif g in (28, 30): home_move = True
            elif g in (0, 1, 2, 3) or 73 <= g <= 89: motion = g
            elif g == 80: motion = None

        places = 5 if inch else 4

        if home_move:
            if has_xy: fail('G28/G30 with an X or Y point can\'t be rotated.')
            pos = [None, None]      # the machine goes home: position unknown
            out.append(raw)
            continue

        if machine_coords:
            # Machine-coordinate moves stay where they are, but afterwards the
            # program's own position is unknown.
            if has_xy: pos = [None, None]
            out.append(raw)
            continue

        is_arc = motion in (2, 3)
        if is_arc and plane != 17 and (has_xy or has_ij):
            fail('Arc in the %s plane. Only XY-plane (G17) arcs can be rotated.'
                 % {18: 'XZ (G18)', 19: 'YZ (G19)'}[plane])

        if not has_xy and not (is_arc and has_ij):
            out.append(raw)
            continue

        vals = {L: float(v) for L, v, _, _ in words if L in 'XYIJ'}

        # New XY
        new = {}
        if has_xy:
            if absolute:
                x = vals.get('X', pos[0])
                y = vals.get('Y', pos[1])
                if x is None or y is None:
                    fail('Only %s is given and the other axis isn\'t known yet '
                         'at this point in the program.'
                         % ('X' if 'X' in vals else 'Y'))
                rx, ry = rot(x, y)
                pos = [x, y]
            else:
                rx, ry = rot(vals.get('X', 0.0), vals.get('Y', 0.0))
                if pos[0] is not None and pos[1] is not None:
                    pos = [pos[0] + vals.get('X', 0.0),
                           pos[1] + vals.get('Y', 0.0)]
            new['X'], new['Y'] = rx, ry

        if is_arc and has_ij:
            if arc_abs:
                if 'I' not in vals or 'J' not in vals:
                    fail('Arc centre with G90.1 needs both I and J.')
                new['I'], new['J'] = rot(vals['I'], vals['J'])
            else:
                new['I'], new['J'] = rot(vals.get('I', 0.0), vals.get('J', 0.0))

        # Rebuild the code part: replace the words in place, add the missing
        # partner word (X->Y, I->J) right after the one that's there.
        parts, last, done = [], 0, set()
        for L, v, start, end in words:
            if L not in new: continue
            parts.append(code[last:start])
            if L in done:
                last = end
                continue
            pair = {'X': 'Y', 'Y': 'X', 'I': 'J', 'J': 'I'}[L]
            first, second = (L, pair) if L in 'XI' else (pair, L)
            parts.append('%s%s %s%s' % (first, fmt(new[first], places),
                                        second, fmt(new[second], places)))
            done.update((L, pair))
            last = end
        parts.append(code[last:])
        line = re.sub(r'\s+', ' ', ''.join(parts)).strip()
        if comments: line += ' ' + ' '.join(comments)
        out.append(line)
        moved += 1

    header = ['(Aligned copy of %s, rotated %s degrees about X0 Y0)'
              % (source or 'program', fmt(angle_deg, 3)),
              '(Set X/Y zero on the part\'s reference point before running)']
    text = '\n'.join(header + out) + '\n'
    return text, {'angle': angle_deg, 'lines': moved}


def output_name(source):
    return PREFIX + source


class Align(object):
    def __init__(self, ctrl):
        self.ctrl = ctrl
        self.log = ctrl.log.get('Align')


    def build(self, source, angle):
        ctrl = self.ctrl
        if ctrl.state.get('cycle') != 'idle':
            raise AlignError('Wait until the machine is idle.')
        if not source or '/' in source or source.startswith('.'):
            raise AlignError('No program selected.')
        if source.startswith(PREFIX):
            raise AlignError('%s is already an aligned copy. Select the '
                             'original program so it isn\'t rotated twice.'
                             % source)

        path = ctrl.get_upload(source)
        if not os.path.isfile(path):
            raise AlignError('%s is not on the controller.' % source)

        try: angle = float(angle)
        except (TypeError, ValueError): raise AlignError('Bad angle.')

        with open(path, 'r', encoding = 'utf-8', errors = 'replace') as f:
            lines = f.read().splitlines()

        text, info = transform(lines, angle, source)

        name = output_name(source)
        tmp = ctrl.get_upload(name + '.tmp')
        with open(tmp, 'w', encoding = 'utf-8') as f: f.write(text)
        os.replace(tmp, ctrl.get_upload(name))
        ctrl.state.add_file(name)

        self.log.info('Wrote %s rotated %.3f degrees' % (name, angle))
        info['file'] = name
        info['source'] = source
        return info
