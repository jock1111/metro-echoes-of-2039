#!/usr/bin/env python3
"""Author the original Lurker polygon character, offline, with Python 3 only.

Run: python tools/build-lurker.py
Output: assets/characters/lurker.glb (no sidecar files or downloaded inputs).
The mesh is authored from anatomical cross sections, cut/rebuilt facial openings,
curved digit lofts, and local surface displacement; it is not a primitive assembly.
Disconnected, intersecting limb-root/digit shells are intentional. The torso,
hunched neck, and cranium are a single continuous indexed surface.
All rest joint axes match the asset axes: +Y up, -Z forward, character left +X.
UV islands reuse a deterministic material atlas; they are not a unique bake.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import zlib

PI = math.pi
TAU = 2 * PI
ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ('hips', 'spine', 'chest', 'neck', 'head',
            'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
            'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR')
ZONES = {'skin': (0, 736), 'gum': (736, 832),
         'keratin': (832, 928), 'cavity': (928, 1024)}


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mul(a, s):
    return tuple(x * s for x in a)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(v):
    return mul(v, 1 / max(1e-15, math.sqrt(dot(v, v))))


def mix(a, b, t):
    return a * (1-t) + b * t


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def smooth(x):
    x = clamp(x)
    return x*x*(3-2*x)


def bell(x, center, width):
    return math.exp(-((x-center)/width)**2)


def qmul(a, b):
    x, y, z, w = a
    X, Y, Z, W = b
    return (w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X,
            w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z)


def quat(euler):
    x, y, z = (a/2 for a in euler)
    return unit(qmul(qmul((math.sin(x), 0, 0, math.cos(x)),
                         (0, math.sin(y), 0, math.cos(y))),
                     (0, 0, math.sin(z), math.cos(z))))


def rotate(q, v):
    t = mul(cross(q[:3], v), 2)
    return add(v, add(mul(t, q[3]), cross(q[:3], t)))


def uv_zone(zone, u, v):
    lo, hi = ZONES[zone]
    return (.004 + .992*u, (lo + 10 + (hi-lo-20)*v) / 1024)


def catmull(rows, t):
    """Interpolating cross-section spline, with repeated endpoint controls."""
    t = clamp(t, 0, len(rows)-1)
    i = min(int(t), len(rows)-2)
    f = t-i
    a, b, c, d = (rows[max(0, min(len(rows)-1, j))] for j in (i-1, i, i+1, i+2))
    return tuple(.5*((2*B)+(-A+C)*f+(2*A-5*B+4*C-D)*f*f
                        +(-A+3*B-3*C+D)*f*f*f)
                 for A, B, C, D in zip(a, b, c, d))


class Rig:
    def __init__(self):
        self.bones = []
        self.ids = {}

    def bone(self, name, parent, position):
        assert name not in self.ids
        self.ids[name] = len(self.bones)
        self.bones.append({'name': name, 'parent': self.ids.get(parent),
                           'world': tuple(position)})
        return name

    def globals(self, rotations, hips_y):
        positions, quats = [], []
        for i, bone in enumerate(self.bones):
            parent = bone['parent']
            q = rotations.get(bone['name'], (0, 0, 0, 1))
            if parent is None:
                positions.append((0, hips_y, 0.035))
                quats.append(q)
            else:
                local = sub(bone['world'], self.bones[parent]['world'])
                positions.append(add(positions[parent], rotate(quats[parent], local)))
                quats.append(qmul(quats[parent], q))
        return positions, quats


class Geometry:
    def __init__(self, rig):
        self.rig = rig
        self.p, self.uv, self.color, self.joints, self.weights = [], [], [], [], []
        self.faces = []
        self.parts = {}

    def vertex(self, p, uv, weights, color=(1, 1, 1)):
        weights = {self.rig.ids[k] if isinstance(k, str) else k: v
                   for k, v in weights.items() if v > 1e-8}
        ordered = sorted(weights.items(), key=lambda kv: (-kv[1], kv[0]))[:4]
        total = sum(w for _, w in ordered)
        assert total > 0
        js = [j for j, _ in ordered]
        ws = [w/total for _, w in ordered]
        self.p.append(tuple(p))
        self.uv.append(tuple(uv))
        self.color.append(tuple(round(clamp(c)*255) for c in color) + (255,))
        self.joints.append(tuple(js + [0]*(4-len(js))))
        self.weights.append(tuple(ws + [0.]*(4-len(ws))))
        return len(self.p)-1

    def quad(self, a, b, c, d):
        self.faces.extend(((a, b, c), (a, c, d)))

    def part(self, name, start):
        self.parts[name] = len(self.faces)-start

    def cap(self, ring, weights, uv, reverse=False, color=(1, 1, 1)):
        center = tuple(sum(self.p[j][k] for j in ring[:-1])/(len(ring)-1) for k in range(3))
        c = self.vertex(center, uv, weights, color)
        for a, b in zip(ring, ring[1:]):
            self.faces.append((c, b, a) if reverse else (c, a, b))

    def loft(self, name, controls, rings, sides, weight_at, zone='skin',
             color=(1, 1, 1), sculpt=.0, caps=True, phase=0.0):
        """Controls are (x,y,z,width,depth); parallel-transport-like x frame."""
        start = len(self.faces)
        rows = []
        for k in range(rings):
            f = k/(rings-1)
            t = f*(len(controls)-1)
            row = catmull(controls, t)
            p = row[:3]
            tangent = unit(sub(catmull(controls, min(t+.002, len(controls)-1))[:3],
                               catmull(controls, max(t-.002, 0))[:3]))
            u = unit(sub((1, 0, 0), mul(tangent, tangent[0])))
            if dot(u, u) < .5:
                u = unit(cross((0, 0, 1), tangent))
            v = unit(cross(tangent, u))
            ring = []
            for j in range(sides+1):
                angle = TAU*j/sides
                wrinkle = 1 + sculpt*(.6*math.cos(3*angle+phase+f*5)
                                      + .3*math.cos(7*angle-f*13)
                                      + .2*math.sin(f*TAU*5+angle*2))
                a = max(.00035, row[3])*math.cos(angle)*wrinkle
                b = max(.00035, row[4])*math.sin(angle)*wrinkle
                pos = add(p, add(mul(u, a), mul(v, b)))
                crease = 1 - sculpt*.5*max(0, math.cos(7*angle-f*13))
                tint = tuple(c*crease for c in color)
                ring.append(self.vertex(pos, uv_zone(zone, j/sides, f), weight_at(t), tint))
            if rows:
                for j in range(sides):
                    self.quad(rows[-1][j], rows[-1][j+1], ring[j+1], ring[j])
            rows.append(ring)
        if caps:
            self.cap(rows[0], weight_at(0), uv_zone(zone, .5, 0), True, color)
            self.cap(rows[-1], weight_at(len(controls)-1), uv_zone(zone, .5, 1), False, color)
        self.part(name, start)
        return rows

    def finish(self):
        """Remove hole-interior vertices; average normals across UV seams."""
        used = sorted({v for f in self.faces for v in f})
        remap = {old: new for new, old in enumerate(used)}
        for name in ('p', 'uv', 'color', 'joints', 'weights'):
            setattr(self, name, [getattr(self, name)[i] for i in used])
        self.faces = [tuple(remap[i] for i in f) for f in self.faces]
        accumulated = {}
        keys = [tuple(round(v, 7) for v in p) for p in self.p]
        self.min_area = float('inf')
        for a, b, c in self.faces:
            normal = cross(sub(self.p[b], self.p[a]), sub(self.p[c], self.p[a]))
            area = math.sqrt(dot(normal, normal))*.5
            self.min_area = min(self.min_area, area)
            assert area > 1e-12, ('Degenerate triangle', a, b, c, area)
            for i in (a, b, c):
                key = keys[i]
                accumulated[key] = add(accumulated.get(key, (0, 0, 0)), normal)
        self.normals = [unit(accumulated[k]) for k in keys]
        for normal in self.normals:
            assert abs(dot(normal, normal)-1) < 1e-6
        # Explicit tangent frames avoid dependency on a loader's tangent fallback.
        tangents, bitangents = {}, {}
        for a, b, c in self.faces:
            e1, e2 = sub(self.p[b], self.p[a]), sub(self.p[c], self.p[a])
            d1, d2 = sub(self.uv[b], self.uv[a]), sub(self.uv[c], self.uv[a])
            det = d1[0]*d2[1]-d1[1]*d2[0]
            if abs(det) < 1e-12:
                continue
            t = mul(sub(mul(e1, d2[1]), mul(e2, d1[1])), 1/det)
            bvec = mul(sub(mul(e2, d1[0]), mul(e1, d2[0])), 1/det)
            for i in (a, b, c):
                # Do not blend unrelated UV islands at their shared position.
                key = (keys[i], round(self.uv[i][0], 5), round(self.uv[i][1], 5))
                tangents[key] = add(tangents.get(key, (0, 0, 0)), t)
                bitangents[key] = add(bitangents.get(key, (0, 0, 0)), bvec)
        self.tangents = []
        for i, n in enumerate(self.normals):
            key = (keys[i], round(self.uv[i][0], 5), round(self.uv[i][1], 5))
            t = tangents.get(key, (1, 0, 0))
            t = sub(t, mul(n, dot(n, t)))
            if dot(t, t) < 1e-14:
                t = cross(n, (0, 0, 1) if abs(n[2]) < .9 else (0, 1, 0))
            t = unit(t)
            sign = -1 if dot(cross(n, t), bitangents.get(key, (0, 1, 0))) < 0 else 1
            self.tangents.append((*t, sign))


# Anatomical loft profile: y, half width, anterior/posterior depth, center z.
PROFILE = [(.735, .080, .061, .037), (.775, .143, .091, .034),
           (.825, .149, .101, .037), (.900, .110, .077, .043),
           (.963, .126, .095, .045), (1.034, .179, .131, .054),
           (1.105, .226, .163, .062), (1.158, .208, .175, .038),
           (1.207, .155, .151, -.018), (1.245, .108, .133, -.090),
           (1.275, .113, .122, -.165), (1.318, .132, .125, -.216),
           (1.369, .133, .120, -.225), (1.410, .121, .113, -.205),
           (1.452, .105, .103, -.186), (1.480, .076, .077, -.178),
           (1.496, .037, .040, -.172)]


def profile(y):
    for i in range(len(PROFILE)-1):
        if y <= PROFILE[i+1][0]:
            t = (y-PROFILE[i][0])/(PROFILE[i+1][0]-PROFILE[i][0])
            return catmull([r[1:] for r in PROFILE], i+clamp(t))
    return PROFILE[-1][1:]


def body_point(y, angle):
    width, depth, zc = profile(y)
    s, c = math.sin(angle), math.cos(angle)
    chest = bell(y, 1.06, .135)
    side = abs(s)**.7
    ribs = math.cos((y-.947)*105 + abs(angle)*1.15)
    ribs *= chest*side*max(0, c)*.0085
    # Asymmetric clavicle/rib relief, a hollow waist, knobbly dorsal spine.
    x = s*(width+ribs) * (1+.034*math.sin(angle+1.2)*bell(y, 1.08, .20))
    x += .004*bell(y, 1.42, .09)
    z = zc-c*(depth+ribs)
    z += .018*bell(y, .995, .082)*bell(angle, 0, .30)
    z -= .013*bell(y, 1.141 + .025*abs(s), .014)*max(0, c)
    back = bell(abs(angle), PI, .24)
    z += back*(.006+.009*math.cos((y-.82)*94)**8)*bell(y, 1.1, .23)
    # Sculpted cranial planes, brow overhangs, cheek hollows and nasal bridge.
    if y > 1.25:
        for sign in (-1, 1):
            eye = sign*.53
            z += .015*bell(y, 1.38, .024)*bell(angle, eye, .29)
            z -= (.017 if sign == 1 else .022)*bell(y, 1.405, .011)*bell(angle, eye, .37)
            z -= .014*bell(y, 1.352, .018)*bell(angle, sign*.83, .22)
            z += .012*bell(y, 1.326, .022)*bell(angle, sign*.92, .24)
        z -= .036*bell(y, 1.361, .030)*bell(angle, 0, .15)
        z += .011*bell(y, 1.340, .008)*bell(angle, 0, .10)
        # Old slanting orbital wound and scalp corrugations.
        scarline = 1.399 + angle*.056
        scar = bell(y, scarline, .0035)*bell(angle, .61, .30)
        z += scar*.006
        x += .0022*math.sin(angle*5+y*29)*bell(y, 1.45, .04)
    return (x, y, z)


def body_weights(y, angle):
    anchors = [(.80, 'hips'), (.95, 'spine'), (1.125, 'chest'),
               (1.247, 'neck'), (1.322, 'head')]
    result = {'hips': 1.0}
    if y >= anchors[-1][0]:
        result = {'head': 1.0}
    else:
        for (a, n), (b, m) in zip(anchors, anchors[1:]):
            if a <= y < b:
                t = smooth((y-a)/(b-a))
                result = {n: 1-t, m: t}
                break
    jaw = .88*bell(angle, 0, .67)*bell(y, 1.277, .037)
    if y > 1.306:
        jaw *= 1-smooth((y-1.306)/.012)
    if jaw > .001:
        result = {k: v*(1-jaw) for k, v in result.items()}
        result['jaw'] = jaw
    return result


def torso(mesh):
    start = len(mesh.faces)
    sides = 64
    ys = [.735+.495*i/34 for i in range(35)]
    ys += [1.236+.260*i/44 for i in range(45)]
    rings = []
    for y in ys:
        ring = []
        for j in range(sides+1):
            a = -PI+TAU*j/sides
            hollow = bell(y, .99, .15)*abs(math.sin(a))*.07
            tint = (1-hollow*.6, .97-hollow, .965-hollow*.7)
            ring.append(mesh.vertex(body_point(y, a), uv_zone('skin', j/sides, (y-.735)/.761),
                                    body_weights(y, a), tint))
        rings.append(ring)
    holes = [('mouth', 0, 1.302, .79, .034),
             ('eyeL', .53, 1.381, .235, .0145),
             ('eyeR', -.53, 1.383, .255, .014)]
    omitted = {name: [] for name, *_ in holes}
    for k in range(len(rings)-1):
        y = (ys[k]+ys[k+1])/2
        for j in range(sides):
            a = -PI+TAU*(j+.5)/sides
            quad = (rings[k][j], rings[k+1][j], rings[k+1][j+1], rings[k][j+1])
            for name, ac, yc, ar, yr in holes:
                if ((a-ac)/ar)**2 + ((y-yc)/yr)**2 < 1:
                    omitted[name].append(quad)
                    break
            else:
                mesh.quad(*quad)
    # Pole caps have distinct positions, avoiding zero-area degenerate ring tips.
    bottom = mesh.vertex((0, .727, .037), uv_zone('skin', .5, 0), {'hips': 1})
    top = mesh.vertex((.004, 1.502, -.171), uv_zone('skin', .5, 1), {'head': 1})
    for j in range(sides):
        mesh.faces.append((bottom, rings[0][j], rings[0][j+1]))
        mesh.faces.append((top, rings[-1][j+1], rings[-1][j]))
    mesh.part('continuous_torso_neck_cranium', start)
    for name, ac, yc, ar, yr in holes:
        edges = {}
        for face in omitted[name]:
            for a, b in zip(face, (*face[1:], face[0])):
                if (b, a) in edges:
                    del edges[b, a]
                else:
                    edges[a, b] = True
        successor = dict(edges)
        first = min(successor)
        loop, cursor = [], first
        while not loop or cursor != first:
            loop.append(cursor)
            cursor = successor[cursor]
            assert len(loop) <= len(edges)
        assert len(loop) == len(edges), ('Non-simple facial aperture', name)
        params = []
        for index in loop:
            k, j = divmod(index, sides+1)
            a = -PI+TAU*j/sides
            phi = math.atan2((ys[k]-yc)/yr, (a-ac)/ar)
            aa, yy = ac+ar*math.cos(phi), yc+yr*math.sin(phi)
            if name == 'mouth':
                yy += .0025*math.cos(phi*3+.7)
            mesh.p[index] = body_point(yy, aa)
            mesh.uv[index] = uv_zone('skin', (aa+PI)/TAU, (yy-.735)/.761)
            params.append((phi, aa, yy))
        start = len(mesh.faces)
        # Rolled lip/lid, exposed gum, and a deeply inset sealed cavity. These
        # replace the removed skin, rather than covering a solid facial surface.
        previous = loop
        mouth = name == 'mouth'
        stages = [(1.018, -.003, 'skin'), (.93, .004, 'gum'),
                  (.87, .014, 'gum'), (.68, .035, 'cavity'),
                  (.32, .062 if mouth else .029, 'cavity')]
        for stage, (scale, inset, zone) in enumerate(stages):
            new = []
            for n, (phi, aa, yy) in enumerate(params):
                p = body_point(yc+(yy-yc)*scale, ac+(aa-ac)*scale)
                p = add(p, (0, 0, inset))
                weights = {'head': 1}
                if mouth:
                    j = .86*smooth((-math.sin(phi)+.1)/.8)
                    weights = {'head': 1-j, 'jaw': j}
                tint = (1, .76, .78) if zone == 'skin' else (1, 1, 1)
                if not mouth and zone == 'gum':
                    tint = (.48, .47, .53)
                new.append(mesh.vertex(p, uv_zone(zone, n/len(loop), stage/4), weights, tint))
            for n in range(len(loop)):
                nn = (n+1) % len(loop)
                mesh.quad(previous[n], previous[nn], new[nn], new[n])
            previous = new
        center = mesh.vertex((body_point(yc, ac)[0], yc, body_point(yc, ac)[2]+(.078 if mouth else .034)),
                             uv_zone('cavity', .5, .5), {'head': 1})
        for n in range(len(loop)):
            mesh.faces.append((previous[n], previous[(n+1) % len(loop)], center))
        mesh.part(name+'_rim_and_cavity', start)
        if not mouth:
            # Flattened irregular lens recessed behind the brow, not an eyeball sphere.
            cx = body_point(yc, ac)[0]
            cz = body_point(yc, ac)[2]+.012
            blind = name == 'eyeR'
            controls = [(cx, yc-.005, cz+.003, .005, .002),
                        (cx+.001, yc, cz, .011 if blind else .008, .003),
                        (cx, yc+.004, cz+.003, .005, .0015)]
            mesh.loft(name+'_recessed_lens', controls, 5, 10, lambda _: {'head': 1},
                      'keratin', (.43, .46, .45) if blind else (.72, .66, .53), sculpt=.13)
    # Uneven, asymmetric upper and lower dentition; several teeth are missing.
    for upper, count in ((True, 12), (False, 10)):
        for i in range(count):
            if (upper and i == 3) or (not upper and i == 7):
                continue
            f = -.89+1.78*i/(count-1)
            angle = .79*f
            y = 1.302 + (1 if upper else -1)*.032*math.sqrt(1-f*f)
            p = body_point(y, angle)
            p = (p[0], y, p[2]+.006)
            length = (.026+.016*(.5+.5*math.sin(i*3.71+(0 if upper else 2))))
            if i in (1, count-2):
                length *= 1.25
            direction = -1 if upper else 1
            radius = .006+.0018*(.5+.5*math.sin(i*1.72))
            controls = [(*p, radius, radius*.78),
                        (p[0]*.97, y+direction*length*.35, p[2]-.002, radius*.78, radius*.65),
                        (p[0]*.94, y+direction*length*.78, p[2]-.006, radius*.37, radius*.31),
                        (p[0]*.92+.002*math.sin(i), y+direction*length, p[2]-.003, .0006, .0005)]
            bone = 'head' if upper else 'jaw'
            mesh.loft(('upper' if upper else 'lower')+f'_tooth_{i+1}', controls, 5, 7,
                      lambda _, bone=bone: {bone: 1}, 'keratin', (1, .94, .83), .08)


def blend_weights(a, b, t):
    t = smooth(t)
    return {a: 1-t, b: t}


def make_anatomy():
    rig = Rig()
    rig.bone('hips', None, (0, .81, .035))
    rig.bone('spine', 'hips', (0, .955, .045))
    rig.bone('chest', 'spine', (0, 1.115, .045))
    rig.bone('neck', 'chest', (0, 1.235, -.075))
    rig.bone('head', 'neck', (0, 1.347, -.220))
    rig.bone('jaw', 'head', (0, 1.316, -.263))
    hands = []
    for side, s in (('L', 1), ('R', -1)):
        d = 0 if s == 1 else -.014
        shoulder = (s*.214, 1.108+d, .031)
        elbow = (s*.326, .864+d, -.030)
        wrist = (s*.437, .509+d, -.174)
        rig.bone('shoulder'+side, 'chest', shoulder)
        rig.bone('elbow'+side, 'shoulder'+side, elbow)
        rig.bone('wrist'+side, 'elbow'+side, wrist)
        rig.bone('hip'+side, 'hips', (s*.088, .796, .035))
        rig.bone('knee'+side, 'hip'+side, (s*.140, .491, -.087))
        rig.bone('ankle'+side, 'knee'+side, (s*.147, .190, .093))
        rig.bone('foot'+side, 'ankle'+side, (s*.154, .052, -.102))
        for number, label in enumerate(('Index', 'Middle', 'Ring', 'Little', 'Thumb')):
            if number < 4:
                offset = (-.039, -.012, .016, .040)[number]
                length = (.139, .162, .148, .117)[number] * (1 if s == 1 else 1.06)
                p = (s*(.451+offset), .415+d+(number == 3)*.012, -.186)
                mid = (p[0]+s*.009, p[1]-length*.50, p[2]-.023)
                tip = (p[0]+s*.010, p[1]-length*.83, p[2]-.061)
                end = (p[0]+s*.006, p[1]-length, p[2]-.100)
            else:
                p = (s*.398, .463+d, -.170)
                mid = (s*.363, .423+d, -.199)
                tip = (s*.350, .379+d, -.234)
                end = (s*.361, .352+d, -.273)
            a, b = 'finger'+label+side, 'finger'+label+'Tip'+side
            rig.bone(a, 'wrist'+side, p)
            rig.bone(b, a, mid)
            hands.append((side, number, p, mid, tip, end, a, b))
    mesh = Geometry(rig)
    torso(mesh)
    for side, s in (('L', 1), ('R', -1)):
        d = 0 if s == 1 else -.014
        # Upper-arm atrophy, prominent elbow, elongated bowed forearm and a
        # flattened metacarpal fan, all one continuous loft per arm.
        arm = [(s*.193, 1.126+d, .038, .046, .064),
               (s*.255, 1.042+d, .021, .052, .050),
               (s*.298, .946+d, -.004, .031, .034),
               (s*.326, .864+d, -.030, .037, .030),
               (s*.366, .762+d, -.059, .047, .037),
               (s*.405, .620+d, -.132, .026, .025),
               (s*.437, .509+d, -.174, .024, .021),
               (s*.447, .451+d, -.181, .050, .018),
               (s*.452, .412+d, -.189, .048, .012)]
        def arm_weights(t, side=side):
            if t < 2.0:
                return {'shoulder'+side: 1}
            if t < 3.7:
                return blend_weights('shoulder'+side, 'elbow'+side, (t-2)/1.7)
            if t < 5.4:
                return {'elbow'+side: 1}
            return blend_weights('elbow'+side, 'wrist'+side, (t-5.4)/1.4)
        mesh.loft('arm_and_hand'+side, arm, 34, 22, arm_weights, sculpt=.13, phase=s)
        leg = [(s*.088, .798, .035, .064, .075),
               (s*.122, .705, .003, .067, .065),
               (s*.141, .588, -.061, .042, .041),
               (s*.140, .491, -.087, .042, .045),
               (s*.145, .406, -.018, .035, .041),
               (s*.147, .286, .071, .021, .031),
               (s*.147, .190, .093, .027, .029),
               (s*.150, .104, .007, .030, .025),
               (s*.154, .052, -.102, .057, .027),
               (s*.153, .040, -.150, .055, .023)]
        def leg_weights(t, side=side):
            if t < 1.9:
                return {'hip'+side: 1}
            if t < 3.6:
                return blend_weights('hip'+side, 'knee'+side, (t-1.9)/1.7)
            if t < 5.2:
                return {'knee'+side: 1}
            if t < 6.8:
                return blend_weights('knee'+side, 'ankle'+side, (t-5.2)/1.6)
            return blend_weights('ankle'+side, 'foot'+side, (t-6.8)/1.2)
        mesh.loft('digitigrade_leg'+side, leg, 33, 22, leg_weights, sculpt=.14, phase=s*1.7)
        for toe in range(3):
            x = s*(.154+(toe-1)*.037)
            endz = -.243 + abs(toe-1)*.019
            controls = [(x, .040, -.128, .021, .018),
                        (x+s*(toe-1)*.009, .033, -.184, .019, .021),
                        (x+s*(toe-1)*.013, .025, endz, .012, .014),
                        (x+s*(toe-1)*.014, .015, endz-.025, .003, .004)]
            bone = 'foot'+side
            mesh.loft(f'toe_{toe+1}'+side, controls, 10, 10,
                      lambda _, bone=bone: {bone: 1}, sculpt=.11)
            p = controls[2]
            nail = [(*p[:3], .012, .008),
                    (p[0], .027, endz-.016, .009, .006),
                    (p[0]+s*.002, .006, endz-.041, .0005, .0005)]
            mesh.loft(f'toenail_{toe+1}'+side, nail, 6, 8,
                      lambda _, bone=bone: {bone: 1}, 'keratin', (.64, .61, .57), .1)
    for side, number, p, mid, tip, end, a, b in hands:
        size = 1.18 if number == 4 else 1
        controls = [(*p, .0125*size, .011*size),
                    (*mid, .013*size, .010*size),
                    (*tip, .008*size, .007*size)]
        mesh.loft(a+'_skin', controls, 13, 10,
                  lambda t, a=a, b=b: blend_weights(a, b, (t-.45)/.95),
                  sculpt=.15, phase=number)
        nail = [(*tip, .009*size, .008*size),
                (*tuple(mix(u, v, .48) for u, v in zip(tip, end)), .005*size, .0055*size),
                (*end, .00055, .00045)]
        mesh.loft(b+'_hook', nail, 8, 10, lambda _, b=b: {b: 1},
                  'keratin', (.58, .55, .54), sculpt=.09)
    # Put the lowest authored claw exactly on Y=0. All bones and vertices share
    # this offset, so the inverse binds and animation rest translations agree.
    ground = min(p[1] for p in mesh.p)
    for i, p in enumerate(mesh.p):
        mesh.p[i] = (p[0], p[1]-ground, p[2])
    for bone in rig.bones:
        p = bone['world']
        bone['world'] = (p[0], p[1]-ground, p[2])
    mesh.finish()
    assert set(CONTRACT).issubset(rig.ids)
    return rig, mesh


def noise_grid(n, seed):
    def hash_value(x, y):
        h = ((x*374761393+y*668265263+seed*1442695041) & 0xffffffff)
        h = ((h ^ (h >> 13))*1274126177) & 0xffffffff
        return ((h ^ (h >> 16)) & 0xffff)/32767.5-1
    return [[hash_value(x, y) for x in range(n)] for y in range(n)]


def noise_axes(size, n):
    return [(int(x*n/size) % n, smooth((x*n/size) % 1)) for x in range(size)]


def png(size, data):
    def chunk(name, payload):
        return struct.pack('>I', len(payload))+name+payload+struct.pack('>I', zlib.crc32(name+payload) & 0xffffffff)
    # Filter 0 deliberately avoids platform-dependent imaging-library behavior.
    raw = b''.join(b'\0'+data[y*size*3:(y+1)*size*3] for y in range(size))
    return (b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('>2I5B', size, size, 8, 2, 0, 0, 0))
            +chunk(b'IDAT', zlib.compress(raw, 9))+chunk(b'IEND', b''))


def textures(size):
    """Locally authored, tileable mottling, pores, raised scars, and packed ORM."""
    grids = [noise_grid(n, 2039+i*47) for i, n in enumerate((8, 24, 80, 256))]
    axes = [noise_axes(size, n) for n in (8, 24, 80, 256)]
    albedo, orm, normal = bytearray(size*size*3), bytearray(size*size*3), bytearray(size*size*3)
    height = [0.]*(size*size)
    row_bounds = []
    for y in range(size):
        reference_y = y*1024/size
        zone = next(name for name, (lo, hi) in ZONES.items() if lo <= reference_y < hi)
        lo, hi = ZONES[zone]
        row_bounds.append((int(lo*size/1024), int(hi*size/1024)-1))
        rowinfo = []
        for grid, axis in zip(grids, axes):
            iy, fy = axis[y]
            rowinfo.append((grid[iy], grid[(iy+1) % len(grid)], fy, axis))
        # Thin, discontinuous diagonal scar threads with a raised pale edge.
        scars = []
        for k in range(8):
            sy = 62+k*79
            window = max(0, 1-abs(reference_y-sy)/62)
            if window:
                x = (91+k*127+(reference_y-sy)*(.4 if k % 2 else -.7)
                     +5*math.sin(reference_y*.043+k)) % 1024
                scars.append((x*size/1024, window))
        for x in range(size):
            values = []
            for r0, r1, fy, axis in rowinfo:
                ix, fx = axis[x]
                nx = (ix+1) % len(r0)
                values.append(mix(mix(r0[ix], r0[nx], fx), mix(r1[ix], r1[nx], fx), fy))
            broad, patch, pore, grain = values
            pit = max(0, (grain-.35))*1.7
            i = y*size+x
            if zone == 'skin':
                bruise = max(0, -patch-.08)
                pink = max(0, patch)*17
                value = broad*10+pore*7+grain*3
                scar, edge = 0., 0.
                for center, window in scars:
                    distance = abs(x-center)*1024/size
                    if distance < 7:
                        scar += bell(distance, 0, 1.05)*window
                        edge += bell(distance, 2.6, 1.05)*window
                rgb = (145+value+pink-bruise*36-scar*25+edge*14,
                       134+value-pink*.7-bruise*30-scar*32+edge*7,
                       130+value-pink*.45-bruise*16-scar*26+edge*7)
                height[i] = pore*.42+grain*.12-pit*.16-scar*.7+edge*.55
                rough = .85+.07*patch+.05*grain-.10*scar
                ao = .96-pit*.10-scar*.12
            elif zone == 'gum':
                rgb = (91+patch*18+grain*7, 40+patch*9+grain*4, 45+patch*10+grain*4)
                height[i] = pore*.28+grain*.1
                rough, ao = .46+.08*patch, .91
            elif zone == 'keratin':
                fiber = math.sin(x*.49+patch*3)*2
                rgb = (186+patch*20+fiber, 170+patch*17+fiber, 139+patch*19+fiber)
                height[i] = pore*.12+math.sin(x*.49+patch*3)*.045
                rough, ao = .52+.12*patch, .98
            else:
                rgb = (24+patch*8, 11+patch*4, 17+patch*5)
                height[i] = pore*.15
                rough, ao = .36+.10*patch, .68
            albedo[i*3:i*3+3] = bytes(round(clamp(c, 0, 255)) for c in rgb)
            orm[i*3:i*3+3] = bytes((round(clamp(ao)*255), round(clamp(rough)*255), 0))
    for y in range(size):
        lo, hi = row_bounds[y]
        yp, yn = max(lo, y-1), min(hi, y+1)
        for x in range(size):
            dx = height[y*size+(x-1) % size]-height[y*size+(x+1) % size]
            dy = height[yp*size+x]-height[yn*size+x]
            n = unit((dx*1.65, dy*1.65, 1))
            i = (y*size+x)*3
            normal[i:i+3] = bytes(round((c*.5+.5)*255) for c in n)
    return [png(size, data) for data in (albedo, normal, orm)]


def pose(name, t, rig):
    """Authored Euler envelopes converted to normalized native joint quaternions."""
    e = {bone['name']: [0., 0., 0.] for bone in rig.bones}
    hy = rig.bones[rig.ids['hips']]['world'][1]
    if name == 'Idle':
        p = TAU*t/3
        breath = math.sin(p)
        e['spine'][0] = .016*breath
        e['chest'][0] = -.025*breath
        e['neck'][0] = .014*breath
        e['head'] = [.008*breath, .025*math.sin(p), -.013*math.sin(p)]
        e['jaw'][0] = -.015*(1+breath)
        for side, s in (('L', 1), ('R', -1)):
            e['shoulder'+side][2] = s*.017*breath
            e['elbow'+side][0] = .014*math.sin(p)
            for number, label in enumerate(('Index', 'Middle', 'Ring', 'Little', 'Thumb')):
                e['finger'+label+'Tip'+side][0] = .035*math.sin(p+s*number*.2)
    elif name in ('Walk', 'Run'):
        run = name == 'Run'
        p = TAU*t/(.65 if run else 1.1)
        amplitude = .53 if run else .29
        e['hips'] = [-.07 if run else .015, .065*math.sin(p), .035*math.sin(p)]
        e['spine'] = [-.055 if run else 0, -.045*math.sin(p), -.018*math.sin(p)]
        e['chest'] = [-.035 if run else 0, -.055*math.sin(p), 0]
        e['head'] = [.04 if run else .01, .02*math.sin(p), -.02*math.sin(p)]
        for side, s in (('L', 1), ('R', -1)):
            phase = p+(0 if s == 1 else PI)
            stride = math.sin(phase)
            lift = max(0, math.cos(phase))
            e['hip'+side][0] = amplitude*stride
            e['knee'+side][0] = -(.54 if run else .27)*lift
            e['ankle'+side][0] = .24*lift-amplitude*.32*stride
            e['foot'+side][0] = -.10*lift
            e['shoulder'+side] = [-amplitude*.86*stride, 0, s*(.07 if run else .025)]
            e['elbow'+side][0] = -.15 if run else -.045
            e['wrist'+side][0] = -.08*stride
            for label in ('Index', 'Middle', 'Ring', 'Little', 'Thumb'):
                e['finger'+label+'Tip'+side][0] = -.11 if run else -.045
    elif name == 'Attack':
        # A short two-handed raking strike: anticipation, extension, impact,
        # follow-through and recovery. No movement of the scene root.
        keys = [(0, 0., 0.), (.19, 1., 0.), (.34, .25, 1.),
                (.47, 0., .85), (.70, 0., 0.)]
        wind, strike = envelope(keys, t)
        e['hips'][0] = .08*wind-.12*strike
        e['spine'][0] = .06*wind-.12*strike
        e['chest'] = [.08*wind-.19*strike, .12*wind-.17*strike, 0]
        e['head'][0] = -.11*wind+.12*strike
        e['jaw'][0] = -.30*strike-.08*wind
        for side, s in (('L', 1), ('R', -1)):
            e['shoulder'+side] = [1.18*wind+.65*strike, s*.24*strike, s*(.20*wind-.27*strike)]
            e['elbow'+side][0] = .48*wind-.18*strike
            e['wrist'+side][0] = -.42*wind+.42*strike
            for label in ('Index', 'Middle', 'Ring', 'Little', 'Thumb'):
                e['finger'+label+side][0] = .10*wind-.24*strike
                e['finger'+label+'Tip'+side][0] = -.12*wind+.54*strike
    elif name == 'Hit':
        kick, twist = envelope([(0, 0., 0.), (.08, 1., 1.), (.19, .44, .6), (.4, 0., 0.)], t)
        e['hips'][0] = .045*kick
        e['spine'] = [.13*kick, .09*twist, -.08*twist]
        e['chest'][0] = .15*kick
        e['neck'][0] = -.11*kick
        e['head'] = [.17*kick, -.15*twist, .09*twist]
        e['jaw'][0] = -.11*kick
        for side, s in (('L', 1), ('R', -1)):
            e['shoulder'+side] = [.16*kick, 0, s*.13*kick]
            e['elbow'+side][0] = .17*kick
    elif name == 'Death':
        fall = smooth((t-.06)/.63)
        settle = smooth((t-.62)/.28)
        e['hips'] = [-1.07*fall, -.13*fall, .12*fall]
        e['spine'] = [-.16*fall, 0, .04*fall]
        e['chest'] = [-.12*fall, .13*fall, -.09*fall]
        e['neck'][0] = .16*fall
        e['head'] = [.14*fall+.07*settle, -.22*fall, -.18*fall]
        e['jaw'][0] = -.26*fall+.08*settle
        hy -= .54*fall
        for side, s in (('L', 1), ('R', -1)):
            e['hip'+side] = [-1.01*fall, s*.32*fall, s*.29*fall]
            e['knee'+side][0] = 1.28*fall
            e['ankle'+side][0] = -.40*fall
            e['foot'+side][0] = .24*fall
            e['shoulder'+side] = [.50*fall-.14*settle, s*.26*fall, s*.55*fall]
            e['elbow'+side][0] = .94*fall
            e['wrist'+side][0] = -.36*fall
            for label in ('Index', 'Middle', 'Ring', 'Little', 'Thumb'):
                e['finger'+label+side][0] = -.17*fall
                e['finger'+label+'Tip'+side][0] = .37*fall
    return {k: quat(v) for k, v in e.items()}, hy


def envelope(keys, t):
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            f = smooth((t-a[0])/(b[0]-a[0]))
            return tuple(mix(x, y, f) for x, y in zip(a[1:], b[1:]))
    return keys[-1][1:]


def skin_points(rig, mesh, rotations, hy, indices=None):
    positions, quats = rig.globals(rotations, hy)
    for i in (range(len(mesh.p)) if indices is None else indices):
        p = mesh.p[i]
        v = (0., 0., 0.)
        for joint, weight in zip(mesh.joints[i], mesh.weights[i]):
            if weight:
                b = rig.bones[joint]
                transformed = add(positions[joint], rotate(quats[joint], sub(p, b['world'])))
                v = add(v, mul(transformed, weight))
        yield v


def animations(rig, mesh):
    result = []
    ground_vertices = [i for i, p in enumerate(mesh.p) if p[1] < .30]
    for name, duration, steps in (('Idle', 3., 24), ('Walk', 1.1, 22),
                                  ('Run', .65, 26), ('Attack', .7, 28),
                                  ('Hit', .4, 16), ('Death', .9, 36)):
        times = [duration*i/steps for i in range(steps+1)]
        frames = []
        for t in times:
            rotations, hy = pose(name, t, rig)
            # Contact correction is vertical HIP motion, never scene root motion.
            # Death uses the complete skinned surface; other clips use both feet.
            indices = None if name == 'Death' else ground_vertices
            floor = min(p[1] for p in skin_points(rig, mesh, rotations, hy, indices))
            hy -= floor
            frames.append((rotations, (0., hy, .035)))
        if name in ('Idle', 'Walk', 'Run'):
            frames[-1] = frames[0]
        result.append((name, times, frames))
    return result


class GLB:
    def __init__(self):
        self.doc = {'asset': {'version': '2.0', 'generator': 'Lurker anatomical loft author / Python stdlib',
                              'copyright': 'Original procedurally authored game asset; no external source assets'},
                    'scene': 0, 'scenes': [{'name': 'Lurker', 'nodes': [0]}],
                    'nodes': [], 'meshes': [], 'skins': [], 'animations': [],
                    'bufferViews': [], 'accessors': [], 'buffers': []}
        self.data = bytearray()

    def view(self, payload, target=None):
        self.data.extend(b'\0'*((-len(self.data)) % 4))
        view = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': len(payload)}
        if target:
            view['target'] = target
        self.data.extend(payload)
        self.doc['bufferViews'].append(view)
        return len(self.doc['bufferViews'])-1

    def accessor(self, rows, kind, component=5126, target=None, bounds=False, normalized=False):
        sizes = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
        n = sizes[kind]
        flat = list(rows) if n == 1 else [v for row in rows for v in row]
        code = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[component]
        payload = struct.pack('<'+str(len(flat))+code, *flat)
        a = {'bufferView': self.view(payload, target), 'componentType': component,
             'count': len(flat)//n, 'type': kind}
        if bounds:
            a['min'] = [min(flat[i::n]) for i in range(n)]
            a['max'] = [max(flat[i::n]) for i in range(n)]
        if normalized:
            a['normalized'] = True
        self.doc['accessors'].append(a)
        return len(self.doc['accessors'])-1

    def write(self, path):
        self.doc['buffers'] = [{'byteLength': len(self.data)}]
        raw = json.dumps(self.doc, separators=(',', ':'), ensure_ascii=True).encode('utf-8')
        raw += b' '*((-len(raw)) % 4)
        self.data.extend(b'\0'*((-len(self.data)) % 4))
        total = 12+8+len(raw)+8+len(self.data)
        out = (struct.pack('<4sII', b'glTF', 2, total)+struct.pack('<I4s', len(raw), b'JSON')+raw
               +struct.pack('<I4s', len(self.data), b'BIN\0')+self.data)
        path.write_bytes(out)
        return out


def export(rig, mesh, clips, images, size, path):
    glb = GLB()
    doc = glb.doc
    doc['nodes'] = [{'name': 'LurkerRoot', 'children': [1, len(rig.bones)+1]}]
    for i, bone in enumerate(rig.bones):
        parent = bone['parent']
        translation = bone['world'] if parent is None else sub(bone['world'], rig.bones[parent]['world'])
        node = {'name': bone['name'], 'translation': translation}
        children = [j+1 for j, b in enumerate(rig.bones) if b['parent'] == i]
        if children:
            node['children'] = children
        doc['nodes'].append(node)
    doc['nodes'].append({'name': 'Lurker_SkinnedSurface', 'mesh': 0, 'skin': 0})
    matrices = []
    for bone in rig.bones:
        x, y, z = bone['world']
        matrices.append((1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1))
    doc['skins'] = [{'name': 'Lurker_AnatomicalRig', 'skeleton': 1,
                     'joints': list(range(1, len(rig.bones)+1)),
                     'inverseBindMatrices': glb.accessor(matrices, 'MAT4')}]
    attributes = {}
    for name, rows, kind, component in (
            ('POSITION', mesh.p, 'VEC3', 5126), ('NORMAL', mesh.normals, 'VEC3', 5126),
            ('TANGENT', mesh.tangents, 'VEC4', 5126), ('TEXCOORD_0', mesh.uv, 'VEC2', 5126),
            ('COLOR_0', mesh.color, 'VEC4', 5121), ('JOINTS_0', mesh.joints, 'VEC4', 5123),
            ('WEIGHTS_0', mesh.weights, 'VEC4', 5126)):
        attributes[name] = glb.accessor(rows, kind, component, 34962, name == 'POSITION', name == 'COLOR_0')
    indices = glb.accessor([v for face in mesh.faces for v in face], 'SCALAR', 5123, 34963)
    doc['meshes'] = [{'name': 'Lurker_AuthoredPolygonSurface',
                      'primitives': [{'attributes': attributes, 'indices': indices, 'material': 0, 'mode': 4}],
                      'extras': {'triangleCount': len(mesh.faces), 'surfaceParts': mesh.parts,
                                 'authoring': 'Anatomical ring lofts with excised/rebuilt facial apertures'}}]
    names = ['Lurker_DeadSkin_BaseColor', 'Lurker_DeadSkin_Normal', 'Lurker_DeadSkin_OcclusionRoughnessMetallic']
    doc['images'] = [{'name': name, 'mimeType': 'image/png', 'bufferView': glb.view(data)}
                     for name, data in zip(names, images)]
    doc['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
    doc['textures'] = [{'name': name, 'source': i, 'sampler': 0} for i, name in enumerate(names)]
    doc['materials'] = [{'name': 'Lurker_DeadSkin_Atlas',
                         'pbrMetallicRoughness': {'baseColorTexture': {'index': 0},
                                                 'metallicRoughnessTexture': {'index': 2},
                                                 'metallicFactor': 0, 'roughnessFactor': 1},
                         'normalTexture': {'index': 1, 'scale': .65},
                         'occlusionTexture': {'index': 2, 'strength': .7},
                         'alphaMode': 'OPAQUE', 'doubleSided': False}]
    for name, times, frames in clips:
        animation = {'name': name, 'samplers': [], 'channels': [],
                     'extras': {'inPlace': True, 'loop': name in ('Idle', 'Walk', 'Run')}}
        inputs = glb.accessor(times, 'SCALAR', bounds=True)
        for i, bone in enumerate(rig.bones):
            output = glb.accessor([f[0][bone['name']] for f in frames], 'VEC4')
            index = len(animation['samplers'])
            animation['samplers'].append({'input': inputs, 'output': output, 'interpolation': 'LINEAR'})
            animation['channels'].append({'sampler': index, 'target': {'node': i+1, 'path': 'rotation'}})
        output = glb.accessor([f[1] for f in frames], 'VEC3')
        animation['samplers'].append({'input': inputs, 'output': output, 'interpolation': 'LINEAR'})
        animation['channels'].append({'sampler': len(animation['samplers'])-1,
                                      'target': {'node': 1, 'path': 'translation'}})
        doc['animations'].append(animation)
    doc['extras'] = {'character': 'Lurker', 'forward': '-Z', 'up': '+Y', 'meters': True,
                     'bindPoseGroundY': 0, 'textureResolution': [size, size],
                     'recommendedBoneMap': {name: name for name in CONTRACT},
                     'source': 'tools/build-lurker.py',
                     'limitations': ['Generated authored polygon model, not a hand sculpt.',
                                     'Shared UV atlas; intersecting limb-root and digit shells.',
                                     'FK gait with vertical contact correction, not full IK.']}
    return glb.write(path)


def inspect_glb(raw):
    """Validate the serialized file, including binary skin and animation data."""
    magic, version, length = struct.unpack_from('<4sII', raw)
    assert (magic, version, length) == (b'glTF', 2, len(raw))
    size, tag = struct.unpack_from('<I4s', raw, 12)
    assert tag == b'JSON'
    doc = json.loads(raw[20:20+size])
    length, tag = struct.unpack_from('<I4s', raw, 20+size)
    assert tag == b'BIN\0' and length % 4 == 0
    binary = raw[28+size:]
    assert len(binary) == length
    assert len(doc['buffers']) == 1 and 'uri' not in doc['buffers'][0]
    def read(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        code = {5126: 'f', 5123: 'H', 5121: 'B', 5125: 'I'}[a['componentType']]
        offset = view.get('byteOffset', 0)+a.get('byteOffset', 0)
        length = a['count']*n*struct.calcsize(code)
        assert offset+length <= view.get('byteOffset', 0)+view['byteLength']
        return list(struct.iter_unpack('<'+code*n, binary[offset:offset+length]))
    for view in doc['bufferViews']:
        assert view.get('byteOffset', 0) % 4 == 0
        assert view.get('byteOffset', 0)+view['byteLength'] <= doc['buffers'][0]['byteLength']
    for i in range(len(doc['accessors'])):
        assert all(math.isfinite(x) for row in read(i) for x in row)
    reachable = set()
    def walk(i):
        assert i not in reachable, 'Scene node appears twice'
        reachable.add(i)
        for child in doc['nodes'][i].get('children', []):
            walk(child)
    for node in doc['scenes'][0]['nodes']:
        walk(node)
    skin = doc['skins'][0]
    assert set(skin['joints']) <= reachable
    prim = doc['meshes'][0]['primitives'][0]
    a = prim['attributes']
    p = read(a['POSITION'])
    weights, joints = read(a['WEIGHTS_0']), read(a['JOINTS_0'])
    max_error = max(abs(sum(w)-1) for w in weights)
    assert max_error < 1e-6
    assert all(0 <= x <= 1 for row in weights for x in row)
    assert all(0 <= j < len(skin['joints']) for row in joints for j in row)
    assert all(i[0] < len(p) for i in read(prim['indices']))
    world = {}
    def translation(i):
        if i in world:
            return world[i]
        local = doc['nodes'][i].get('translation', (0, 0, 0))
        parent = next((j for j, node in enumerate(doc['nodes']) if i in node.get('children', [])), None)
        world[i] = local if parent is None else add(local, translation(parent))
        return world[i]
    bind_error = 0.
    for node, matrix in zip(skin['joints'], read(skin['inverseBindMatrices'])):
        bind_error = max(bind_error, *(abs(x+y) for x, y in zip(translation(node), matrix[12:15])))
    assert bind_error < 2e-7
    clip_metrics = {}
    for animation in doc['animations']:
        duration = 0
        for channel in animation['channels']:
            target = channel['target']
            assert target['node'] in skin['joints'], 'Animation moves non-bone node'
            sampler = animation['samplers'][channel['sampler']]
            times, values = read(sampler['input']), read(sampler['output'])
            assert len(times) == len(values)
            assert all(a[0] < b[0] for a, b in zip(times, times[1:]))
            duration = max(duration, times[-1][0])
            if target['path'] == 'rotation':
                assert all(abs(dot(q, q)-1) < 2e-6 for q in values)
            else:
                assert doc['nodes'][target['node']]['name'] == 'hips'
                assert all(abs(v[0]) < 1e-7 and abs(v[2]-.035) < 1e-7 for v in values)
            if animation['name'] in ('Idle', 'Walk', 'Run'):
                assert values[0] == values[-1], 'Loop seam'
        clip_metrics[animation['name']] = {'duration': round(duration, 6),
                                            'channels': len(animation['channels']), 'keysPerChannel': len(times)}
    for image in doc['images']:
        assert 'uri' not in image
        view = doc['bufferViews'][image['bufferView']]
        png_data = binary[view['byteOffset']:view['byteOffset']+view['byteLength']]
        assert png_data[:8] == b'\x89PNG\r\n\x1a\n'
        cursor, compressed = 8, bytearray()
        while cursor < len(png_data):
            count, kind = struct.unpack_from('>I4s', png_data, cursor)
            payload = png_data[cursor+8:cursor+8+count]
            crc, = struct.unpack_from('>I', png_data, cursor+8+count)
            assert crc == zlib.crc32(kind+payload) & 0xffffffff
            if kind == b'IHDR':
                width, height = struct.unpack_from('>II', payload)
            if kind == b'IDAT':
                compressed.extend(payload)
            cursor += count+12
        assert len(zlib.decompress(compressed)) == height*(width*3+1)
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'vertices': len(p), 'triangles': len(read(prim['indices']))//3,
            'meshes': len(doc['meshes']), 'primitives': len(doc['meshes'][0]['primitives']),
            'materials': [m['name'] for m in doc['materials']],
            'bones': [doc['nodes'][i]['name'] for i in skin['joints']],
            'bounds': {'min': [round(min(v[k] for v in p), 6) for k in range(3)],
                       'max': [round(max(v[k] for v in p), 6) for k in range(3)]},
            'maxWeightSumError': max_error, 'maxInverseBindError': bind_error,
            'weightedVertices': sum(sum(w > 0 for w in row) > 1 for row in weights),
            'textureDimensions': [width, height], 'embeddedPNGs': len(doc['images']),
            'animations': clip_metrics, 'recommendedBoneMap': doc['extras']['recommendedBoneMap']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--texture-size', type=int, choices=(512, 1024), default=1024)
    parser.add_argument('--inspect', action='store_true', help='Only validate and report the existing output')
    args = parser.parse_args()
    path = ROOT/'assets'/'characters'/'lurker.glb'
    if args.inspect:
        print(json.dumps(inspect_glb(path.read_bytes()), indent=2))
        return
    assert path.parent.is_dir(), 'Create assets/characters before running the authoring tool'
    print('Authoring anatomical lofts and rig...', flush=True)
    rig, mesh = make_anatomy()
    assert 12000 <= len(mesh.faces) <= 25000, len(mesh.faces)
    assert len(mesh.p) < 65536
    rest = {b['name']: (0, 0, 0, 1) for b in rig.bones}
    hy = rig.bones[0]['world'][1]
    rest_error = max(abs(a-b) for p, q in zip(mesh.p, skin_points(rig, mesh, rest, hy)) for a, b in zip(p, q))
    assert rest_error < 1e-12, rest_error
    print('Authoring in-place joint clips and correcting ground contact...', flush=True)
    clips = animations(rig, mesh)
    print(f'Painting three deterministic {args.texture_size}px PBR maps...', flush=True)
    images = textures(args.texture_size)
    raw = export(rig, mesh, clips, images, args.texture_size, path)
    metrics = inspect_glb(raw)
    metrics['minimumTriangleArea'] = mesh.min_area
    metrics['restPoseSkinError'] = rest_error
    metrics['deathFinalHipsY'] = clips[-1][2][-1][1][1]
    metrics['surfaceTriangles'] = mesh.parts
    print(json.dumps(metrics, indent=2))


if __name__ == '__main__':
    main()
