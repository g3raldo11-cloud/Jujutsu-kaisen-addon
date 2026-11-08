"""Peças e utilidades compartilhadas pelos três personagens mecanizados.

Todos usam a mesma lista de PAPÉIS de material (cada herói define a cor/acabamento de cada papel):
    C  'carvao'   armadura principal          CU 'cobre'   frisos e metais nobres
    RU 'rubro'    pintura de destaque          JA 'jade'    segunda cor de destaque
    BO 'borracha' juntas e tecido técnico      AC 'aco'     hastes, pinos e garras
    BR 'brasa'    frestas luminosas            NU 'nucleo'  núcleos muito brilhantes
    VI 'visor'    vidro escuro                 EX 'extra'   emissão secundária
"""
import numpy as np
from math import radians

from . import geo

ROLES = ['carvao', 'cobre', 'rubro', 'jade', 'borracha', 'aco', 'brasa', 'nucleo', 'visor', 'extra']
C, CU, RU, JA, BO, AC, BR, NU, VI, EX = range(len(ROLES))
F = geo.FRONT


def align_y(d, up=(0, 0, 1)):
    """Matriz cujo eixo Y local aponta para ``d``."""
    y = geo.unit(d)
    up = np.asarray(up, float)
    if abs(np.dot(y, geo.unit(up))) > 0.95:
        up = np.array((1.0, 0, 0))
    x = geo.unit(np.cross(y, up))
    z = np.cross(x, y)
    return np.stack([x, y, z], axis=1)


def align_z(d, ref=(0, -1, 0)):
    x, y, z = geo.basis_from(d, ref)
    return np.stack([x, y, z], axis=1)


class Builder:
    def __init__(self, rig, detail=2):
        self.r = rig
        self.d = detail          # nível de subdivisão das placas grandes

    def part(self, pv, cage, bevel=(0.005, 2), sub=None):
        return self.r.add(pv, cage, ROLES, bevel=bevel, sub=self.d if sub is None else sub)

    def pair(self, pv_r, pv_l, cage, bevel=(0.005, 2), sub=None):
        self.r.add_mirror(pv_r, pv_l, cage, ROLES, bevel=bevel, sub=self.d if sub is None else sub)

    def sym(self, pv, cage, bevel=(0.005, 2), sub=None):
        """Peça simétrica no mesmo pivô (constrói o lado +X e espelha)."""
        self.r.add(pv, cage, ROLES, bevel=bevel, sub=self.d if sub is None else sub)
        self.r.add(pv, cage.mirrored_x(), ROLES, bevel=bevel, sub=self.d if sub is None else sub)


def keel(strength=0.7, width=0.16):
    """Quilha central (placa mais grossa no meio, no sentido v)."""
    return lambda U, V: 1.0 + strength * np.exp(-((V - 0.5) / width) ** 2)


def bulge(strength=0.8, base=0.5):
    """Placa abaulada (mais grossa no centro)."""
    return lambda U, V: base + strength * np.sin(np.pi * U) * np.sin(np.pi * V) ** 0.5


def seam_plates(b, pv_r, pv_l, surf, u_ranges, vc, half, off=0.008, thick=0.016, m=C, nv=8, glow=BR):
    """Placas separadas por frestas com uma faixa luminosa por baixo."""
    for (u0, u1) in u_ranges:
        b.pair(pv_r, pv_l, geo.plate(surf, u0, u1, vc - half, vc + half, max(4, int((u1 - u0) * 30)), nv, off, thick, m), (0.004, 2))
    u0, u1 = u_ranges[0][0], u_ranges[-1][1]
    b.pair(pv_r, pv_l, geo.plate(surf, u0 + 0.01, u1 - 0.01, vc - half * 0.85, vc + half * 0.85, 10, 6, off * 0.4, 0.005, glow), None, 1)


def hand(b, pv_r, pv_l, W, s=1.0, fingers=4, curl=(14, 24, 22), m_main=C, m_tip=RU, m_joint=CU, m_claw=AC):
    """Mão mecânica (lado +X, espelhada): palma, dorso, dedos com falanges e juntas, polegar.
    A mão pende para baixo (-Z) com a palma voltada para dentro (-X)."""
    W = np.asarray(W, float)
    hnd = geo.Cage()
    joints = geo.Cage()
    tips = geo.Cage()
    hnd.merge(geo.box(W + np.array((0.0, 0.0, -0.058)) * s, np.array((0.036, 0.088, 0.09)) * s, geo.euler(0, 6, 0), m_main))
    hnd.merge(geo.box(W + np.array((0.021, 0.0, -0.06)) * s, np.array((0.012, 0.082, 0.076)) * s, geo.euler(0, 6, 0), m_tip))
    joints.merge(geo.cyl(W + np.array((0.003, -0.044, -0.108)) * s, W + np.array((0.003, 0.044, -0.108)) * s, 0.0125 * s, 16, m=m_joint))
    if fingers == 4:
        spec = ((-0.031, (0.04, 0.03, 0.024)), (-0.0105, (0.045, 0.033, 0.026)), (0.0105, (0.043, 0.032, 0.025)), (0.031, (0.036, 0.027, 0.022)))
    else:
        spec = ((-0.027, (0.042, 0.032, 0.026)), (0.0, (0.046, 0.034, 0.028)), (0.027, (0.04, 0.03, 0.024)))
    for k, (yk, lens) in enumerate(spec):
        p = W + np.array((0.003, yk, -0.108)) * s
        ang = 0.0
        d = np.array((0, 0, -1.0))
        for j, L in enumerate(lens):
            ang += curl[j] + k * 2
            d = geo.rot((0, 1, 0), radians(ang)) @ np.array((0, 0, -1.0))
            Rk = np.stack([geo.unit(np.cross((0, 1, 0), d)), np.array((0, 1.0, 0)), d], axis=1)
            w = 0.0175 if fingers == 4 else 0.021
            hnd.merge(geo.box(p + d * L * s / 2, np.array((0.019, w, L * 0.92)) * s, Rk, m_main if j < 2 else m_tip))
            p = p + d * L * s
            if j < 2:
                joints.merge(geo.cyl(p - np.array((0, 0.0095, 0)) * s, p + np.array((0, 0.0095, 0)) * s, 0.0085 * s, 12, m=m_joint))
        tips.merge(geo.lathe([(0.0088 * s, 0.0), (0.007 * s, 0.006 * s), (0.0, 0.012 * s)], 10, p - d * 0.004 * s, d, m=m_claw))
    p = W + np.array((-0.006, -0.046, -0.04)) * s
    for j, L in enumerate((0.04, 0.032)):
        d = geo.unit((-0.35 - j * 0.25, -0.45 + j * 0.25, -0.82))
        hnd.merge(geo.box(p + d * L * s / 2, np.array((0.021, 0.02, L * 0.92)) * s, align_z(d, (1, 0, 0)), m_main if j == 0 else m_tip))
        p = p + d * L * s
        joints.merge(geo.ellipsoid(p, (0.011 * s,) * 3, nu=12, nv=6, m=m_joint))
    b.pair(pv_r, pv_l, hnd, (0.005 * s, 2), 1)
    b.pair(pv_r, pv_l, joints, (0.0015 * s, 1), 1)
    b.pair(pv_r, pv_l, tips, None, 1)


def ducted_fan(center, axis, r, blades=12, depth=0.04, m_duct=C, m_rim=CU, m_blade=AC, m_hub=CU, m_glow=None, ref=None, pitch=0.6):
    """Turbina com carenagem: duto (anel com lábio), estatores, rotor separado (para girar)."""
    x, y, z = geo.basis_from(axis, ref)
    o = np.asarray(center, float)
    duct = geo.lathe([(r * 1.0, -depth * 0.5), (r * 1.18, -depth * 0.55), (r * 1.26, -depth * 0.3), (r * 1.24, depth * 0.35),
                      (r * 1.14, depth * 0.55), (r * 1.03, depth * 0.5), (r * 1.0, depth * 0.2)], 40, o, z, ref, False, m_duct)
    stat = geo.Cage()
    for k in range(4):
        a = np.pi / 2 * k + np.pi / 4
        d = np.cos(a) * x + np.sin(a) * y
        stat.merge(geo.box(o + z * depth * 0.32 + d * r * 0.55, (0.006, 0.006, 0.006), None, m_duct))
        stat.merge(geo.cyl(o + z * depth * 0.32 + d * r * 0.18, o + z * depth * 0.32 + d * r * 1.02, r * 0.035, 8, m=m_duct))
    rim = geo.ring_band(o - z * depth * 0.5, z, r * 1.0, r * 1.2, depth * 0.12, 48, m_rim)
    rotor = geo.fan(o, z, r * 0.22, r * 0.97, blades, None, r * 0.04, pitch, m_hub, m_blade, ref)
    back = None
    if m_glow is not None:
        back = geo.lathe([(0.0, depth * 0.45), (r * 0.98, depth * 0.45), (r * 0.98, depth * 0.5), (0.0, depth * 0.5)], 32, o, z, ref, True, m_glow)
    return geo.merge(duct, stat, rim), rotor, back
