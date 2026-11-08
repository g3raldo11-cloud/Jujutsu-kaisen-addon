"""CURUPIRA — "Guardião Térmico" (versão mecanizada).

Armadura-relicário forjada para abrigar o espírito do guardião da mata. Traços da lenda mantidos:
pés virados para trás (calcanhar na frente, garras atrás), cabeleira de fogo (crista de lâminas
incandescentes), corpo atlético e marcas de brasa (frestas luminosas entre as placas).
Mecânica de jogo representada no modelo: Domínio Térmico (núcleo no peito, radiador nas costas,
chaminés), Chamas Invertidas e Fogo Guardião (bocais lança-chamas nos pulsos), Passos
Incandescentes (respiros em brasa nos calcanhares).
"""
import numpy as np
from math import tau, pi, cos, sin, radians

from . import geo, kit, mats, parts
from .parts import (C, CU, RU, JA, BO, AC, BR, NU, VI, EX, Builder, align_y, align_z, keel, bulge,
                    seam_plates)

ID = 'curupira'
F = geo.FRONT
HERO_COLOR = (1.0, 0.36, 0.06)


def materials():
    return {
        'carvao': mats.make('cur_carvao', (0.035, 0.032, 0.031), 0.85, 0.34, 'metal'),
        'cobre': mats.make('cur_cobre', (0.80, 0.42, 0.24), 1.0, 0.25, 'metal'),
        'rubro': mats.make('cur_rubro', (0.30, 0.028, 0.016), 0.35, 0.32, 'paint', coat=0.5),
        'jade': mats.make('cur_jade', (0.02, 0.22, 0.13), 0.25, 0.28, 'paint', coat=0.8),
        'borracha': mats.make('cur_borracha', (0.011, 0.0105, 0.0105), 0.0, 0.55, 'rubber'),
        'aco': mats.make('cur_aco', (0.62, 0.62, 0.64), 1.0, 0.18, 'metal'),
        'brasa': mats.make('cur_brasa', (0.1, 0.02, 0.0), 0.0, 0.5, 'emit', (1.0, 0.24, 0.025), 2.4),
        'nucleo': mats.make('cur_nucleo', (0.2, 0.1, 0.0), 0.0, 0.4, 'emit', (1.0, 0.5, 0.1), 3.4),
        'visor': mats.make('cur_visor', (0.004, 0.004, 0.005), 0.2, 0.06, 'glass'),
        'extra': mats.make('cur_extra', (0.05, 0.1, 0.2), 0.0, 0.4, 'emit', (0.3, 0.6, 1.0), 2.4),
    }


# ====================================================================== pernas
def legs(b):
    r = b.r
    x = 0.118
    H = np.array((x, 0.0, 0.95))
    K = np.array((x, -0.012, 0.51))
    A = np.array((x, 0.0, 0.10))
    M = np.array((-1.0, 1.0, 1.0))
    r.pivot('coxa_r', H, 'corpo')
    r.pivot('coxa_l', H * M, 'corpo')
    r.pivot('canela_r', K, 'coxa_r')
    r.pivot('canela_l', K * M, 'coxa_l')
    r.pivot('pe_r', A, 'canela_r')
    r.pivot('pe_l', A * M, 'canela_l')

    # ---------------- coxa
    th = geo.LoftSurf([(x, 0.0, 1.0), (x + 0.004, -0.008, 0.86), (x + 0.002, -0.012, 0.68), (x, -0.012, 0.53)],
                      a=[0.088, 0.097, 0.084, 0.062], b=[0.086, 0.09, 0.075, 0.058], p=2.7)
    b.pair('coxa_r', 'coxa_l', th.tube(30, 28, m=BO), None, 1)
    b.pair('coxa_r', 'coxa_l', geo.ellipsoid(H, (0.082, 0.082, 0.082), nu=28, nv=14, m=C), None, 1)
    vf, vo, vi, vb = (kit.vdir(th, 0.5, d) for d in (F, (1, 0, 0), (-1, 0, 0), (0, 1, 0)))
    b.pair('coxa_r', 'coxa_l', geo.plate(th, 0.06, 0.86, lambda u: vf - (0.15 - 0.05 * u), lambda u: vf + (0.15 - 0.05 * u),
                                          16, 10, 0.008, 0.02, C, thick_fn=keel()))
    seam_plates(b, 'coxa_r', 'coxa_l', th, [(0.14, 0.34), (0.37, 0.57), (0.6, 0.8)], vo, 0.1)
    b.pair('coxa_r', 'coxa_l', geo.plate(th, 0.24, 0.8, vi - 0.08, vi + 0.08, 10, 6, 0.008, 0.015, C))
    b.pair('coxa_r', 'coxa_l', geo.plate(th, 0.1, 0.74, vb - 0.12, vb + 0.12, 12, 8, 0.008, 0.018, C, thick_fn=bulge(0.6, 0.6)))
    for (u0, u1) in ((0.02, 0.065), (0.9, 0.95)):
        b.pair('coxa_r', 'coxa_l', geo.plate(th, u0, u1, 0.0, 1.0, 3, 32, 0.004, 0.012, CU, wrap=True), (0.003, 2), 1)
    b.pair('coxa_r', 'coxa_l', geo.piston((x + 0.088, 0.05, 0.93), (x + 0.078, 0.052, 0.6), 0.015, C, AC, CU), (0.002, 2), 1)
    b.pair('coxa_r', 'coxa_l', geo.cable([(x - 0.055, 0.06, 0.99), (x - 0.078, 0.09, 0.8), (x - 0.066, 0.078, 0.58)], 0.0095, 10, ribs=20, m=BO), None, 0)

    # ---------------- joelho
    b.pair('canela_r', 'canela_l', geo.lathe([(0.0, -0.082), (0.03, -0.082), (0.05, -0.074), (0.053, -0.052), (0.045, -0.046),
                                              (0.045, 0.046), (0.053, 0.052), (0.05, 0.074), (0.03, 0.082), (0.0, 0.082)],
                                             28, K, (1, 0, 0), m=CU), (0.003, 2), 1)
    kc = geo.EllipsoidSurf(K + (0, -0.045, 0.004), (0.068, 0.048, 0.08))
    for (u0, u1) in ((-0.2, -0.028), (0.028, 0.2)):
        b.pair('canela_r', 'canela_l', geo.plate(kc, u0, u1, 0.16, 0.86, 10, 12, 0.0, 0.022, C), (0.004, 2))
    b.pair('canela_r', 'canela_l', geo.lathe([(0.0, 0.0), (0.019, 0.0), (0.024, 0.012), (0.018, 0.024), (0.0, 0.027)],
                                             20, K + (0, -0.088, 0.004), F, m=NU), None, 1)

    # ---------------- canela
    sh = geo.LoftSurf([(x, -0.012, 0.5), (x + 0.002, -0.006, 0.36), (x, 0.0, 0.22), (x, 0.004, 0.12)],
                      a=[0.062, 0.07, 0.058, 0.046], b=[0.056, 0.06, 0.052, 0.044], p=2.6)
    b.pair('canela_r', 'canela_l', sh.tube(26, 26, m=BO), None, 1)
    vf, vo, vi, vb = (kit.vdir(sh, 0.5, d) for d in (F, (1, 0, 0), (-1, 0, 0), (0, 1, 0)))
    b.pair('canela_r', 'canela_l', geo.plate(sh, 0.03, 0.9, lambda u: vf - (0.17 - 0.06 * u), lambda u: vf + (0.17 - 0.06 * u),
                                             16, 10, 0.008, 0.022, RU, thick_fn=keel(0.8)))
    b.pair('canela_r', 'canela_l', geo.plate(sh, 0.06, 0.58, vb - 0.15, vb + 0.15, 12, 10, 0.004, 0.03, C, thick_fn=bulge(0.9, 0.45)))
    b.pair('canela_r', 'canela_l', geo.plate(sh, 0.55, 0.86, vb - 0.12, vb + 0.12, 8, 8, 0.004, 0.016, C))
    seam_plates(b, 'canela_r', 'canela_l', sh, [(0.12, 0.4), (0.43, 0.72)], vo, 0.085)
    b.pair('canela_r', 'canela_l', geo.plate(sh, 0.15, 0.75, vi - 0.08, vi + 0.08, 10, 6, 0.008, 0.014, C))
    b.pair('canela_r', 'canela_l', geo.plate(sh, 0.9, 0.97, 0.0, 1.0, 3, 30, 0.004, 0.014, CU, wrap=True), (0.003, 2), 1)
    b.pair('canela_r', 'canela_l', geo.piston((x, 0.078, 0.44), (x, 0.066, 0.16), 0.013, C, AC, CU), (0.002, 2), 1)

    # ---------------- pé virado para trás: calcanhar na FRENTE (-Y), garras para TRÁS (+Y)
    b.pair('pe_r', 'pe_l', geo.lathe([(0.0, -0.062), (0.03, -0.062), (0.043, -0.05), (0.043, 0.05), (0.03, 0.062), (0.0, 0.062)],
                                     24, A, (1, 0, 0), m=CU), (0.003, 2), 1)
    b.pair('pe_r', 'pe_l', geo.box(A + (0, -0.078, -0.045), (0.104, 0.11, 0.088), geo.euler(8, 0, 0), RU), (0.014, 3))
    b.pair('pe_r', 'pe_l', geo.box(A + (0, 0.05, -0.05), (0.094, 0.17, 0.068), geo.euler(-5, 0, 0), C), (0.012, 3))
    b.pair('pe_r', 'pe_l', geo.box(A + (0, 0.015, -0.006), (0.084, 0.12, 0.02), geo.euler(-14, 0, 0), CU), (0.006, 2))
    b.pair('pe_r', 'pe_l', geo.box(A + (0, -0.02, -0.093), (0.108, 0.27, 0.016), None, BO), (0.006, 2), 1)
    for dz in (-0.024, -0.002):
        for sx in (-1, 1):
            b.pair('pe_r', 'pe_l', geo.box(A + (sx * 0.053, -0.08, -0.045 + dz), (0.006, 0.06, 0.009), geo.euler(8, 0, 0), BR), None, 1)
    claws = geo.Cage()
    toes = geo.Cage()
    acts = geo.Cage()
    for dx, splay in ((-0.032, -12.0), (0.0, 0.0), (0.032, 12.0)):
        base = A + (dx, 0.13, -0.066)
        d = geo.rot((0, 0, 1), radians(-splay)) @ geo.rot((1, 0, 0), radians(-8)) @ np.array((0, 1.0, 0))
        toes.merge(geo.box(base + d * 0.042, (0.032, 0.084, 0.042), align_y(d), C))
        toes.merge(geo.box(base + d * 0.118, (0.027, 0.062, 0.034), align_y(d), RU))
        claws.merge(geo.cyl(base + d * 0.084 - (0.02, 0, 0), base + d * 0.084 + (0.02, 0, 0), 0.013, 14, m=CU))
        tip = base + d * 0.148
        cd = geo.unit(d + (0, 0, -0.45))
        claws.merge(geo.lathe([(0.013, 0.0), (0.012, 0.012), (0.008, 0.03), (0.0, 0.055)], 12, tip, cd, m=AC))
        acts.merge(geo.piston(A + (dx * 0.6, 0.03, 0.0), base + d * 0.1 + (0, 0, 0.03), 0.0065, C, AC, CU, n=10))
    b.pair('pe_r', 'pe_l', toes, (0.008, 3))
    b.pair('pe_r', 'pe_l', claws, (0.002, 1), 1)
    b.pair('pe_r', 'pe_l', acts, (0.0015, 1), 1)
    r.anchor('FX_pe_r', A + (0, -0.11, -0.07), 'pe_r')
    r.anchor('FX_pe_l', (A + (0, -0.11, -0.07)) * M, 'pe_l')


# ====================================================================== quadril e tronco
def torso(b):
    r = b.r
    ts = geo.LoftSurf([(0, 0.005, 0.96), (0, 0.0, 1.06), (0, -0.004, 1.16), (0, -0.01, 1.28), (0, -0.008, 1.4), (0, 0.004, 1.5), (0, 0.01, 1.565)],
                      a=[0.115, 0.1, 0.094, 0.128, 0.15, 0.14, 0.085], b=[0.165, 0.135, 0.125, 0.185, 0.228, 0.205, 0.1],
                      p=[3.0, 2.6, 2.4, 3.0, 3.4, 3.2, 2.5], offN=[0.0, 0.0, 0.0, 0.008, 0.016, 0.004, -0.01], ref=F)
    uz = ts.u_at
    b.part('corpo', ts.tube(48, 40, m=BO), None, 1)
    # pélvis e encaixes do quadril
    b.part('corpo', geo.ellipsoid((0, 0.005, 0.975), (0.16, 0.115, 0.1), (3.0, 3.0), None, 36, 18, BO), None, 1)
    b.sym('corpo', geo.lathe([(0.05, 0.0), (0.092, 0.0), (0.098, 0.02), (0.088, 0.042), (0.058, 0.048)], 32, (0.15, 0.0, 0.95), (1, 0, 0), m=C), (0.004, 2), 1)
    # cinto com fivela-núcleo
    b.part('corpo', geo.plate(ts, uz(1.0), uz(1.045), 0.0, 1.0, 4, 44, 0.004, 0.016, CU, wrap=True), (0.003, 2), 1)
    pb = ts.eval(uz(1.022), 0.0)
    b.part('corpo', geo.lathe([(0.0, 0.0), (0.042, 0.0), (0.046, 0.01), (0.038, 0.02), (0.0, 0.022)], 28, pb + (0, -0.012, 0), F, m=CU), (0.002, 2), 1)
    b.part('corpo', geo.lathe([(0.0, 0.0), (0.022, 0.0), (0.024, 0.026), (0.0, 0.03)], 20, pb + (0, -0.012, 0), F, m=NU), None, 1)
    # saiote de placas (tassets)
    sk = geo.EllipsoidSurf((0, 0.005, 1.0), (0.205, 0.165, 0.25), (2.2, 3.0))
    for (u0, u1, v0, m) in ((-0.06, 0.06, 0.24, C), (0.44, 0.56, 0.24, C)):
        b.part('corpo', geo.plate(sk, u0, u1, v0, 0.48, 8, 10, 0.0, 0.018, m))
        b.part('corpo', geo.plate(sk, u0 + 0.004, u1 - 0.004, v0, v0 + 0.03, 3, 8, 0.016, 0.007, CU), (0.002, 1), 1)
    def tasset(UN, VN):
        u = 0.155 + 0.19 * UN
        vlow = 0.17 - 0.07 * np.maximum(0, np.sin(UN * np.pi * 2.0)) ** 2
        return u, vlow + (0.47 - vlow) * VN
    b.sym('corpo', geo.plate(sk, nu=14, nv=12, off=0.006, thick=0.018, m=C, uvfn=tasset, thick_fn=keel(0.5, 0.25)))
    b.sym('corpo', geo.plate(sk, 0.17, 0.33, 0.3, 0.45, 8, 5, 0.026, 0.006, CU), (0.002, 1), 1)
    # abdômen segmentado com costura de brasa no centro
    for (z0, z1) in ((1.07, 1.118), (1.126, 1.174), (1.182, 1.232)):
        b.sym('corpo', geo.plate(ts, uz(z0), uz(z1), 0.012, 0.092, 5, 7, 0.006, 0.016, C, thick_fn=bulge(0.5, 0.7)), (0.004, 2))
    b.part('corpo', geo.plate(ts, uz(1.066), uz(1.236), -0.014, 0.014, 8, 3, 0.002, 0.004, BR), None, 1)
    # mangueiras dos flancos
    b.sym('corpo', geo.cable([(0.168, -0.005, 1.28), (0.152, 0.02, 1.16), (0.142, 0.018, 1.04)], 0.0135, 12, ribs=16, m=BO), None, 0)
    b.sym('corpo', geo.cable([(0.155, 0.03, 1.27), (0.138, 0.05, 1.15), (0.13, 0.045, 1.04)], 0.0105, 10, ribs=14, m=BO), None, 0)
    # coluna (vértebras) na lombar
    for k in range(4):
        z = 1.07 + k * 0.045
        p = ts.eval(uz(z), 0.5)
        b.part('corpo', geo.box(p + (0, 0.014, 0), (0.05, 0.032, 0.034), None, CU if k % 2 else C), (0.006, 2), 1)
    # peitorais com borda inferior inclinada
    def pec(UN, VN):
        ub = uz(1.285 + 0.08 * VN)
        ut = uz(1.478 - 0.025 * VN)
        return ub + (ut - ub) * UN, 0.024 + 0.195 * VN
    b.sym('corpo', geo.plate(ts, nu=14, nv=12, off=0.006, thick=0.03, m=C, uvfn=pec, thick_fn=bulge(0.75, 0.5)))
    # friso de cobre sob o peitoral
    def pec_trim(UN, VN):
        ub = uz(1.27 + 0.08 * VN)
        return ub + (uz(1.285 + 0.08 * VN) - ub) * UN, 0.03 + 0.185 * VN
    b.sym('corpo', geo.plate(ts, nu=3, nv=12, off=0.008, thick=0.012, m=CU, uvfn=pec_trim), (0.002, 1), 1)
    # placa da garganta e gola
    b.part('corpo', geo.plate(ts, uz(1.47), uz(1.53), -0.085, 0.085, 5, 10, 0.012, 0.016, RU))
    b.part('corpo', geo.plate(ts, uz(1.528), uz(1.565), 0.0, 1.0, 3, 40, 0.004, 0.02, CU, wrap=True), (0.003, 2), 1)
    # gola alta nas costas (moldura da cabeça)
    gc = geo.EllipsoidSurf((0, 0.02, 1.55), (0.17, 0.14, 0.18), (2.6, 2.4))
    b.part('corpo', geo.plate(gc, 0.27, 0.73, 0.5, 0.8, 16, 8, 0.0, 0.022, RU, thick_fn=keel(0.4, 0.2)))
    b.part('corpo', geo.plate(gc, 0.28, 0.72, 0.785, 0.815, 16, 3, 0.004, 0.01, CU), (0.002, 1), 1)
    # trapézios
    b.sym('corpo', geo.plate(ts, uz(1.46), uz(1.555), 0.13, 0.31, 8, 10, 0.004, 0.02, C))
    # costas: placa + radiador de aletas sobre fundo em brasa
    b.part('corpo', geo.plate(ts, uz(1.24), uz(1.5), 0.36, 0.64, 14, 14, 0.006, 0.02, C))
    b.part('corpo', geo.plate(ts, uz(1.28), uz(1.47), 0.43, 0.57, 10, 8, 0.026, 0.003, BR), None, 1)
    fins = geo.Cage()
    for k in range(7):
        xk = -0.075 + k * 0.025
        yb = ts.eval(uz(1.38), 0.5)[1] + 0.026
        poly = [(0.0, 1.29), (0.03, 1.3), (0.048, 1.335), (0.05, 1.43), (0.034, 1.465), (0.0, 1.47)]
        fins.merge(geo.extrude(poly, 0.007, (xk, yb, 0.0), (0, 1, 0), (0, 0, 1), CU))
    b.part('corpo', fins, (0.002, 2), 1)
    # chaminés de exaustão
    for sx in (1, -1):
        base = np.array((0.13 * sx, 0.125, 1.41))
        d = geo.unit((0.12 * sx, 0.5, 1.0))
        b.part('corpo', geo.lathe([(0.0, 0.0), (0.04, 0.0), (0.04, 0.12), (0.034, 0.14), (0.034, 0.2), (0.047, 0.24), (0.043, 0.252),
                                   (0.031, 0.226), (0.0, 0.226)], 28, base, d, m=C), (0.003, 2), 1)
        for h in (0.05, 0.09):
            b.part('corpo', geo.ring_band(base + d * h, d, 0.039, 0.046, 0.012, 40, CU), (0.002, 1), 1)
        b.part('corpo', geo.lathe([(0.0, 0.0), (0.031, 0.0), (0.031, 0.006), (0.0, 0.006)], 24, base + d * 0.224, d, m=NU), None, 0)
        b.part('corpo', geo.box(base + d * 0.03 + (0, -0.03, 0), (0.05, 0.05, 0.05), align_y(d), C), (0.008, 2), 1)
        r.anchor('FX_chamine_' + ('r' if sx > 0 else 'l'), base + d * 0.27, 'corpo')
    # costelas laterais com brasa por baixo
    for (z0, z1) in ((1.215, 1.25), (1.265, 1.3), (1.315, 1.35)):
        b.sym('corpo', geo.plate(ts, uz(z0), uz(z1), 0.19, 0.31, 4, 8, 0.008, 0.016, C), (0.004, 2))
    b.sym('corpo', geo.plate(ts, uz(1.212), uz(1.353), 0.2, 0.3, 8, 6, 0.003, 0.004, BR), None, 1)
    # Coração Térmico: carcaça de cobre, núcleo, íris de 6 lâminas e aletas radiais
    pc = ts.eval(uz(1.36), 0.0) + (0, -0.018, 0)
    b.part('corpo', geo.lathe([(0.0, -0.01), (0.072, -0.01), (0.078, 0.012), (0.07, 0.032), (0.054, 0.038), (0.047, 0.028), (0.047, 0.014), (0.0, 0.014)],
                              40, pc, F, m=CU), (0.003, 2), 1)
    b.part('corpo', geo.lathe([(0.0, 0.0), (0.046, 0.0), (0.041, 0.02), (0.026, 0.03), (0.0, 0.034)], 32, pc + (0, -0.004, 0), F, m=NU), None, 1)
    iris = geo.Cage()
    x_, y_, z_ = geo.basis_from(F, (0, 0, 1))
    for k in range(6):
        a = tau * k / 6
        pts = []
        for (rr, da) in ((0.022, 0.0), (0.046, 0.0), (0.046, 0.62), (0.03, 0.75)):
            pts.append((cos(a + da) * rr, sin(a + da) * rr))
        iris.merge(geo.extrude(pts, 0.003, pc + F * 0.027, x_, y_, C))
    b.part('corpo', iris, (0.001, 1), 1)
    rad = geo.Cage()
    for k in range(12):
        a = tau * k / 12
        d = cos(a) * x_ + sin(a) * y_
        rad.merge(geo.box(pc + d * 0.085 + F * 0.004, (0.008, 0.026, 0.026), np.stack([geo.unit(np.cross(F, d)), d, -F], 1), C))
    b.part('corpo', rad, (0.003, 2), 1)
    r.anchor('FX_nucleo', pc + F * 0.04, 'corpo')
    # pescoço sanfonado e cabos
    prof = []
    for k in range(13):
        prof.append((0.046 if k % 2 == 0 else 0.052, 1.545 + k * 0.0095))
    b.part('corpo', geo.lathe(prof, 28, (0, 0.004, 0), (0, 0, 1), m=BO), (0.002, 1), 1)
    for (sx, y0) in ((1, -0.04), (-1, -0.04), (1, 0.03), (-1, 0.03)):
        b.part('corpo', geo.cable([(0.07 * sx, y0, 1.53), (0.06 * sx, y0 - 0.012, 1.6), (0.045 * sx, y0 * 0.7, 1.67)], 0.008, 8, m=BO), None, 0)
    return ts


# ====================================================================== braços
def arms(b):
    r = b.r
    x = 0.31
    S = np.array((x, 0.0, 1.47))
    E = np.array((x, 0.0, 1.19))
    W = np.array((x, -0.004, 0.92))
    M = np.array((-1.0, 1.0, 1.0))
    r.pivot('braco_r', S, 'corpo')
    r.pivot('braco_l', S * M, 'corpo')
    r.pivot('antebraco_r', E, 'braco_r')
    r.pivot('antebraco_l', E * M, 'braco_l')
    r.pivot('mao_r', W, 'antebraco_r')
    r.pivot('mao_l', W * M, 'antebraco_l')

    # ---------------- braço
    ua = geo.LoftSurf([(x, 0.0, 1.47), (x + 0.002, -0.005, 1.36), (x, -0.004, 1.27), (x, 0.0, 1.2)],
                      a=[0.066, 0.072, 0.064, 0.054], b=[0.062, 0.066, 0.058, 0.05], p=2.6)
    b.pair('braco_r', 'braco_l', ua.tube(26, 26, m=BO), None, 1)
    b.pair('braco_r', 'braco_l', geo.ellipsoid(S, (0.078, 0.078, 0.078), nu=28, nv=14, m=C), None, 1)
    vf, vo, vi, vb = (kit.vdir(ua, 0.5, d) for d in (F, (1, 0, 0), (-1, 0, 0), (0, 1, 0)))
    b.pair('braco_r', 'braco_l', geo.plate(ua, 0.2, 0.86, vf - 0.16, vf + 0.16, 12, 10, 0.008, 0.02, C, thick_fn=bulge(0.7, 0.6)))
    b.pair('braco_r', 'braco_l', geo.plate(ua, 0.14, 0.8, vb - 0.15, vb + 0.15, 12, 10, 0.008, 0.018, C))
    seam_plates(b, 'braco_r', 'braco_l', ua, [(0.28, 0.5), (0.53, 0.75)], vo, 0.09, thick=0.014)
    b.pair('braco_r', 'braco_l', geo.plate(ua, 0.9, 0.96, 0.0, 1.0, 3, 30, 0.004, 0.012, CU, wrap=True), (0.003, 2), 1)
    b.pair('braco_r', 'braco_l', geo.piston((x - 0.045, -0.06, 1.41), (x - 0.04, -0.056, 1.23), 0.011, C, AC, CU, n=12), (0.002, 1), 1)

    # ---------------- ombreira em lâminas (pauldron)
    pd = geo.EllipsoidSurf(S + (0.016, 0.005, 0.03), (0.132, 0.13, 0.112), (3.0, 2.6))

    def shell(UN, VN):
        u = -0.06 + 0.62 * UN
        spikes = np.maximum(0, np.sin(UN * np.pi * 3.0)) ** 2
        vlow = 0.4 - 0.12 * spikes
        return u, vlow + (0.975 - vlow) * VN
    b.pair('braco_r', 'braco_l', geo.plate(pd, nu=22, nv=14, off=0.014, thick=0.026, m=RU, uvfn=shell,
                                           thick_fn=lambda U, V: 1 + 0.7 * np.exp(-((U - 0.5) / 0.1) ** 2)))
    b.pair('braco_r', 'braco_l', geo.plate(pd, 0.0, 0.5, 0.28, 0.44, 12, 5, 0.004, 0.016, C))
    b.pair('braco_r', 'braco_l', geo.plate(pd, 0.04, 0.46, 0.17, 0.31, 10, 5, -0.004, 0.014, C))
    b.pair('braco_r', 'braco_l', geo.plate(pd, 0.2, 0.3, 0.52, 0.965, 4, 10, 0.05, 0.006, JA), (0.002, 1), 1)
    bl = geo.bolts_on(pd, [(u, 0.52) for u in np.linspace(0.02, 0.48, 9)], 0.041, 0.006, 0.005, CU)
    b.pair('braco_r', 'braco_l', bl, None, 0)
    # aleta de chama sobre a ombreira
    fin = [(0.0, 0.0), (0.05, 0.0), (0.11, 0.035), (0.16, 0.1), (0.1, 0.07), (0.06, 0.06), (0.0, 0.05)]
    top = pd.eval(np.array(0.25), np.array(0.72))
    b.pair('braco_r', 'braco_l', geo.extrude(fin, 0.012, top + (0.0, -0.05, 0.0), (0, 1, 0), geo.unit((0.35, 0, 1)), RU), (0.003, 2), 1)
    b.pair('braco_r', 'braco_l', geo.extrude([(0.06, 0.02), (0.1, 0.045), (0.135, 0.085), (0.09, 0.055)], 0.014,
                                             top + (0.0, -0.05, 0.0), (0, 1, 0), geo.unit((0.35, 0, 1)), BR), (0.001, 1), 0)

    # ---------------- cotovelo
    b.pair('antebraco_r', 'antebraco_l', geo.lathe([(0.0, -0.068), (0.03, -0.068), (0.045, -0.06), (0.045, 0.06), (0.03, 0.068), (0.0, 0.068)],
                                                   24, E, (1, 0, 0), m=CU), (0.003, 2), 1)
    eg = geo.EllipsoidSurf(E + (0, 0.025, 0.0), (0.062, 0.058, 0.075))
    b.pair('antebraco_r', 'antebraco_l', geo.plate(eg, 0.32, 0.68, 0.2, 0.85, 10, 10, 0.0, 0.02, C))

    # ---------------- antebraço-manopla com bocais lança-chamas
    fa = geo.LoftSurf([(x, 0.0, 1.17), (x + 0.002, -0.004, 1.08), (x, -0.004, 1.0), (x, -0.004, 0.935)],
                      a=[0.058, 0.074, 0.072, 0.056], b=[0.056, 0.072, 0.068, 0.052], p=3.2)
    b.pair('antebraco_r', 'antebraco_l', fa.tube(24, 26, m=BO), None, 1)
    vf, vo, vi, vb = (kit.vdir(fa, 0.5, d) for d in (F, (1, 0, 0), (-1, 0, 0), (0, 1, 0)))
    for (dv0, dv1) in ((-0.21, -0.075), (-0.062, 0.062), (0.075, 0.21)):
        b.pair('antebraco_r', 'antebraco_l', geo.plate(fa, 0.05, 0.84, vo + dv0, vo + dv1, 14, 6, 0.008, 0.02, RU, thick_fn=bulge(0.5, 0.75)))
    b.pair('antebraco_r', 'antebraco_l', geo.plate(fa, 0.07, 0.82, vo - 0.2, vo + 0.2, 10, 10, 0.003, 0.004, BR), None, 1)
    b.pair('antebraco_r', 'antebraco_l', geo.plate(fa, 0.1, 0.8, vi - 0.18, vi + 0.18, 12, 10, 0.008, 0.016, C))
    b.pair('antebraco_r', 'antebraco_l', geo.plate(fa, 0.84, 0.96, 0.0, 1.0, 4, 32, 0.006, 0.018, CU, wrap=True), (0.003, 2), 1)
    noz = geo.Cage()
    for dy in (-0.022, 0.022):
        base = np.array((x - 0.04, -0.062 + dy * 0.3, 0.985 + dy))
        d = geo.unit((-0.1, -0.45, -1.0))
        noz.merge(geo.lathe([(0.0, 0.0), (0.016, 0.0), (0.016, 0.05), (0.02, 0.07), (0.017, 0.074), (0.012, 0.06), (0.0, 0.06)], 20, base, d, m=C))
        noz.merge(geo.lathe([(0.0, 0.0), (0.012, 0.0), (0.012, 0.004), (0.0, 0.004)], 16, base + d * 0.058, d, m=NU))
    b.pair('antebraco_r', 'antebraco_l', noz, (0.0015, 1), 1)
    tipn = np.array((x - 0.045, -0.095, 0.915))
    r.anchor('FX_bocal_r', tipn, 'antebraco_r')
    r.anchor('FX_bocal_l', tipn * M, 'antebraco_l')
    b.pair('antebraco_r', 'antebraco_l', geo.piston((x - 0.05, 0.035, 1.14), (x - 0.048, 0.03, 0.975), 0.0085, C, AC, CU, n=10), (0.0015, 1), 1)
    b.pair('antebraco_r', 'antebraco_l', geo.cable([(x + 0.03, 0.05, 1.16), (x + 0.07, 0.07, 1.06), (x + 0.065, 0.05, 0.96)], 0.008, 8, ribs=14, m=BO), None, 0)

    # ---------------- mão: palma, dorso, 4 dedos de 3 falanges e polegar
    parts.hand(b, 'mao_r', 'mao_l', W)


# ====================================================================== cabeça e crista de fogo
def head(b):
    r = b.r
    Hd = np.array((0.0, -0.016, 1.665))
    r.pivot('cabeca', Hd, 'corpo')
    c0 = np.array((0.0, -0.006, 1.778))
    b.part('cabeca', geo.ellipsoid(c0, (0.084, 0.098, 0.108), (2.4, 2.4), None, 36, 20, BO), None, 1)
    hs = geo.EllipsoidSurf(c0 + (0, 0.004, 0.004), (0.094, 0.108, 0.118), (3.0, 2.8))
    # calota (topo) e lâminas da nuca em escada
    b.part('cabeca', geo.plate(hs, 0.1, 0.9, 0.64, 0.975, 18, 10, 0.0, 0.016, C))
    for k, (v0, v1) in enumerate(((0.52, 0.645), (0.4, 0.53), (0.28, 0.41))):
        b.part('cabeca', geo.plate(hs, 0.3 + k * 0.02, 0.7 - k * 0.02, v0, v1, 12, 5, 0.004 + k * 0.006, 0.014, C if k != 1 else RU))
    b.sym('cabeca', geo.vent(hs.eval(np.array(0.31), np.array(0.47)) + (0.012, 0.0, 0.0), geo.euler(0, 0, 90 - 25), 0.05, 0.04, 4, 0.012,
                             0.004, 30, C, CU, BR), (0.001, 1), 0)
    # sobrancelha pesada em V (olhar severo)
    def brow(UN, VN):
        u = -0.13 + 0.26 * UN
        vlow = 0.595 - 0.07 * (1 - np.abs(UN - 0.5) * 2) ** 2
        return u, vlow + (0.73 - vlow) * VN
    b.part('cabeca', geo.plate(hs, nu=16, nv=8, off=0.004, thick=0.022, m=RU, uvfn=brow, thick_fn=keel(0.5, 0.25)))
    # visor escuro, olhos inclinados em brasa
    b.part('cabeca', geo.plate(hs, -0.14, 0.14, 0.47, 0.6, 14, 6, -0.004, 0.012, VI), (0.003, 2), 1)
    eyes = geo.Cage()
    for sx in (1, -1):
        Re = geo.euler(0, -12 * sx, 0)
        eyes.merge(geo.box((0.033 * sx, -0.112, 1.783), (0.036, 0.01, 0.011), Re, NU))
    b.part('cabeca', eyes, (0.002, 1), 1)
    r.anchor('FX_olhos', (0, -0.12, 1.783), 'cabeca')
    # bochechas e mandíbula com respiros de brasa
    b.sym('cabeca', geo.plate(hs, 0.07, 0.2, 0.28, 0.56, 8, 10, 0.004, 0.018, C))
    for (v0, v1) in ((0.36, 0.42), (0.28, 0.345), (0.2, 0.265)):
        b.part('cabeca', geo.plate(hs, -0.075, 0.075, v0, v1, 10, 4, 0.006, 0.016, RU), (0.003, 2))
    b.part('cabeca', geo.plate(hs, -0.07, 0.07, 0.2, 0.42, 8, 6, 0.002, 0.004, BR), None, 1)
    # orelhas pontudas (aletas varridas para trás)
    ear = [(0.0, 0.0), (0.03, 0.012), (0.075, 0.05), (0.13, 0.11), (0.08, 0.06), (0.035, 0.045), (0.0, 0.04)]
    for sx in (1, -1):
        b.part('cabeca', geo.extrude(ear, 0.01, (0.098 * sx, -0.01, 1.775), (0, 1, 0), geo.unit((0.3 * sx, 0, 1)), CU), (0.003, 2), 1)
        b.part('cabeca', geo.extrude([(0.03, 0.03), (0.07, 0.056), (0.105, 0.09), (0.065, 0.054)], 0.012,
                                     (0.098 * sx, -0.01, 1.775), (0, 1, 0), geo.unit((0.3 * sx, 0, 1)), BR), (0.001, 1), 0)

    # ---------------- crista: lâminas curvas (vermelho na raiz, brasa no meio, núcleo na ponta)
    Hc = np.array((0.0, 0.012, 1.885))
    r.pivot('cabelo', Hc, 'cabeca')
    rng = np.random.default_rng(11)
    crest = geo.Cage()
    fins = []
    # faixa central: da testa ao alto da cabeça, as mais altas na frente
    for k in range(9):
        t = k / 8
        fins.append(((rng.uniform(-0.012, 0.012), -0.075 + 0.16 * t, 1.875 + 0.02 * np.sin(t * np.pi)),
                     (rng.uniform(-0.12, 0.12), 0.35 + 0.55 * t, 1.0), 0.42 - 0.17 * t + rng.uniform(-0.03, 0.03), 0.026))
    # faixas laterais, varridas para trás e para fora
    for sx in (-1, 1):
        for k in range(6):
            t = k / 5
            fins.append(((sx * (0.05 + 0.02 * t), -0.05 + 0.13 * t, 1.86 - 0.02 * t),
                         (sx * (0.45 + 0.2 * t), 0.75 + 0.3 * t, 0.85), 0.26 - 0.06 * t + rng.uniform(-0.02, 0.02), 0.02))
    # crina da nuca
    for k in range(5):
        t = k / 4
        fins.append(((rng.uniform(-0.03, 0.03) + (t - 0.5) * 0.06, 0.09 + 0.02 * t, 1.845 - 0.08 * t),
                     ((t - 0.5) * 0.5, 1.0, 0.45 - 0.2 * t), 0.24 - 0.05 * t, 0.018))
    for root, d, L, w in fins:
        root = np.asarray(root, float)
        d = geo.unit(d)
        side = geo.unit(np.cross(d, (0, 1, 0)) + 1e-4)
        up = geo.unit(np.cross(side, d))
        sway = rng.uniform(0.6, 1.0)
        ctrl = [root, root + d * L * 0.28 + side * 0.014 * sway, root + d * L * 0.58 - side * 0.02 * sway + up * 0.03 * L,
                root + d * L * 0.82 + side * 0.012 + np.array((0, 0.05, 0)) * L, root + d * L + np.array((0, 0.12, -0.02)) * L - side * 0.015]
        prof = geo.superellipse(10, w, 0.0055, 2.2)
        crest.merge(geo.sweep(ctrl, prof, 18, ref=side, twist=rng.uniform(-0.5, 0.5),
                              scale=lambda s: ((1 - s) ** 0.85) * (0.75 + 0.25 * np.sin(min(1.0, s * 4) * np.pi / 2)),
                              caps=(True, True), m_fn=lambda s: RU if s < 0.3 else (BR if s < 0.68 else NU)))
    b.part('cabelo', crest, (0.0015, 1), 1)
    b.part('cabelo', geo.ellipsoid(Hc + (0, 0.0, -0.02), (0.06, 0.08, 0.035), nu=24, nv=10, m=CU), (0.002, 1), 1)
    r.anchor('FX_cabelo', Hc + (0, 0.06, 0.16), 'cabelo')


def build(detail=2):
    M = materials()
    rig = kit.Rig(ID, M)
    rig.pivot('corpo', (0, 0, 0), ID)
    b = Builder(rig, detail)
    legs(b)
    torso(b)
    arms(b)
    head(b)
    rig.finalize()
    return rig


# ====================================================================== apresentação (render)
HEIGHT = 2.25


def footprint_poly(center, yaw, scale=1.0, flip=False):
    """Pegada do Curupira: calcanhar para a frente, três dedos/garras para trás."""
    c = np.asarray(center, float)
    Rz = geo.rot((0, 0, 1), yaw)
    out = []
    heel = [(cos(a) * 0.05, -0.06 + sin(a) * 0.045) for a in np.linspace(0, tau, 14, endpoint=False)]
    out.append(heel)
    for dx in (-0.032, 0.0, 0.032):
        toe = [(dx + cos(a) * 0.014, 0.05 + abs(dx) * -0.4 + sin(a) * 0.03) for a in np.linspace(0, tau, 10, endpoint=False)]
        out.append(toe)
    polys = []
    for poly in out:
        P = np.array([(x * (-1 if flip else 1), y, 0.0) for (x, y) in poly]) * scale
        P = P @ Rz.T + c
        polys.append(P[:, :2] - c[:2])
    return polys


def present(rig, mode, a, path):
    from . import stage, fx
    import bpy
    w, h = map(int, a.res.split('x'))
    if mode == 'retrato':
        w, h = 1080, 1350
    stage.setup_render((w, h), a.samples, 0.045, volumetric=True)
    stage.world(horizon=(0.035, 0.018, 0.014), zenith=(0.004, 0.004, 0.007), fog=0.006, fog_color=(1.0, 0.8, 0.65))
    stage.studio(HERO_COLOR, rim2=(0.4, 0.6, 1.0), key_energy=650, rim_energy=1100, top_energy=1300)
    top = stage.pedestal(HERO_COLOR)
    stage.halo((1.0, 0.32, 0.06), (0, 3.6, 2.2), 2.2, 0.6)

    def attach(ob, pivot):
        p = rig.nodes[pivot]
        bpy.context.view_layer.update()
        ob.parent = p
        ob.matrix_parent_inverse = p.matrix_world.inverted()
        return ob

    if not a.nofx:
        hot = fx.tongue_material('cur_lingua', 3.2)
        ember = mats.emission_only('cur_fagulha', (1.0, 0.42, 0.06), 6.0)[0]
        ember2 = mats.emission_only('cur_brasa_ar', (1.0, 0.3, 0.04), 3.0)[0]
        rng = np.random.default_rng(5)
        # ---- cabeleira de fogo: volume + línguas nas pontas das lâminas + brasas subindo
        attach(fx.fire_volume('fogo_cabelo', (0, 0.06, 1.88), 0.2, 0.62, strength=4.0, density=7.0, seed=1.3,
                              R=geo.rot((1, 0, 0), radians(-28))), 'cabelo')
        roots, dirs, Ls, Ws = [], [], [], []
        for k in range(18):
            lat = rng.uniform(-1, 1)
            roots.append((lat * 0.08, rng.uniform(-0.02, 0.16), 2.0 + rng.uniform(0, 0.16) - abs(lat) * 0.08))
            dirs.append((lat * 0.4, 0.5 + rng.uniform(0, 0.4), 1.0))
            Ls.append(rng.uniform(0.12, 0.3))
            Ws.append(rng.uniform(0.025, 0.045))
        attach(fx.tongues('linguas_cabelo', roots, dirs, Ls, Ws, hot, seed=2), 'cabelo')
        attach(fx.streaks('faiscas_cabelo', (0, 0.1, 2.0), 40, 0.3, 0.9, ember, seed=3, length=(0.02, 0.06), thick=0.002), 'cabelo')
        # ---- chaminés: fumaça escura + labaredas curtas
        for sx, nm in ((1, 'r'), (-1, 'l')):
            tip = np.asarray(rig.world['FX_chamine_' + nm])
            attach(fx.smoke_volume('fumaca_' + nm, tip + (0, 0.02, -0.02), 0.16, 1.1, density=2.5, seed=sx * 2.0), 'corpo')
            d = geo.unit((0.12 * sx, 0.5, 1.0))
            attach(fx.tongues('chama_chamine_' + nm, [tip - d * 0.03] * 4, [d + rng.normal(0, 0.15, 3) for _ in range(4)],
                              rng.uniform(0.08, 0.16, 4), rng.uniform(0.02, 0.03, 4), hot, seed=4 + sx), 'corpo')
        # ---- Fogo Guardião: esfera de fogo girando na mão direita
        hand = np.asarray(rig.world['mao_r']) + (0.0, -0.02, -0.08)
        attach(fx.fire_volume('fogo_mao', hand + (0, 0, -0.14), 0.19, 0.5, strength=5.0, density=8.0, seed=4.2, scale=(4, 4, 2.2)), 'mao_r')
        roots, dirs = [], []
        for k in range(14):
            ang = tau * k / 14
            roots.append(hand + (cos(ang) * 0.09, sin(ang) * 0.09, -0.05 + rng.uniform(-0.04, 0.04)))
            dirs.append((-sin(ang) * 0.8, cos(ang) * 0.8, 0.9))
        attach(fx.tongues('redemoinho_mao', roots, dirs, rng.uniform(0.12, 0.24, 14), rng.uniform(0.02, 0.035, 14), hot, seed=7, wobble=0.5), 'mao_r')
        attach(fx.streaks('faiscas_mao', hand + (0, 0, -0.1), 40, 0.25, 0.5, ember, seed=8, swirl=1.2, length=(0.02, 0.07), thick=0.002), 'mao_r')
        # ---- bocal esquerdo: chama-piloto azulada
        tipl = np.asarray(rig.world['FX_bocal_l'])
        blue = fx.tongue_material('cur_piloto', 2.4, fx.BLUE_STOPS)
        attach(fx.tongues('piloto_l', [tipl] * 3, [(-0.1, -0.45, -1.0)] * 3, [0.07, 0.06, 0.05], [0.012, 0.01, 0.009], blue, seed=9), 'antebraco_l')
        # ---- Passos Incandescentes: pegadas invertidas em brasa no chão, com chamas baixas
        shapes, groots = [], []
        for k, (px, py, yaw) in enumerate(((-0.55, -1.15, 0.2), (-0.25, -1.65, 0.1), (-0.62, -2.2, 0.25), (-0.3, -2.75, 0.05), (-0.7, -3.3, 0.2))):
            for poly in footprint_poly((px, py, 0.0), yaw, 1.2, flip=k % 2 == 1):
                shapes.append((np.asarray(poly) + (px, py), 0.003))
            groots.append((px, py, 0.0))
        fx.glow_decals('pegadas', shapes, mats.emission_only('cur_pegada', (1.0, 0.3, 0.04), 2.6)[0])
        fx.tongues('chamas_pegadas', [np.asarray(p) + (rng.uniform(-0.04, 0.04), rng.uniform(-0.06, 0.06), 0) for p in groots for _ in range(3)],
                   [(rng.uniform(-0.2, 0.2), rng.uniform(-0.1, 0.3), 1.0) for _ in range(15)], rng.uniform(0.08, 0.2, 15), rng.uniform(0.02, 0.04, 15), hot, seed=11)
        for i, p in enumerate(groots):
            stage.point_light(f'luz_pegada{i}', (p[0], p[1], 0.12), 12.0, (1.0, 0.4, 0.1), 0.05)
        # ---- anel de chamas atrás do herói (Fogo Guardião) e brasas no ar
        ring_r, ring_roots, ring_dirs = 1.12, [], []
        for k in range(30):
            ang = radians(15 + 150 * k / 29)          # só o arco de trás (y > 0)
            ring_roots.append((cos(ang) * ring_r, sin(ang) * ring_r, top))
            ring_dirs.append((rng.normal(0, 0.12), rng.normal(0, 0.12), 1.0))
        fx.tongues('anel_fogo', ring_roots, ring_dirs, rng.uniform(0.12, 0.34, 30), rng.uniform(0.03, 0.05, 30), hot, seed=12, wobble=0.45)
        fx.motes('brasas_ar', (0, 0.8, 0.0), 160, 3.0, 3.0, 0.0045, ember2, seed=13)
        fx.streaks('faiscas_ar', (0, 0.4, 0.3), 45, 2.0, 2.4, ember, seed=14, length=(0.02, 0.06), thick=0.0016)
        # ---- luzes do fogo
        for nm, pv, off, e in (('luz_nucleo', 'FX_nucleo', (0, -0.06, 0), 25.0), ('luz_cabelo', 'FX_cabelo', (0, 0, 0.1), 60.0),
                               ('luz_mao', 'mao_r', (0, -0.05, -0.15), 55.0), ('luz_olhos', 'FX_olhos', (0, -0.05, 0), 6.0)):
            L = stage.point_light(nm, np.asarray(rig.world[pv]) + off, e, (1.0, 0.42, 0.1), 0.06)
            attach(L, rig.nodes[pv].parent.name if pv.startswith('FX_') else pv)
        for nm in ('r', 'l'):
            L = stage.point_light('luz_chamine_' + nm, np.asarray(rig.world['FX_chamine_' + nm]) + (0, 0.05, 0.05), 30.0, (1.0, 0.4, 0.1), 0.05)
            attach(L, 'corpo')
    rig.root.location.z = top
    pose_hero(rig)
    if mode == 'retrato':
        stage.camera((1.25, -4.1, 1.0 + top), (0.0, 0.0, 1.3 + top), 40, 2.4, focus=(0.0, -0.1, 1.5 + top))
    elif mode == 'close':
        stage.camera((0.55, -1.75, 1.95 + top), (0.0, 0.0, 1.72 + top), 55, 1.8, focus=(0.0, -0.1, 1.78 + top))
    else:
        stage.camera((1.6, -5.0, 0.85 + top), (0.05, 0.0, 1.26 + top), 36, 2.8, focus=(0.0, -0.1, 1.4 + top))
    stage.render(path)


def pose_hero(rig):
    rig.pose('coxa_r', -4, 0, -5)
    rig.pose('coxa_l', 10, 0, 6)
    rig.pose('canela_r', 8, 0, 0)
    rig.pose('canela_l', 4, 0, 0)
    rig.pose('pe_r', -4, 0, 4)
    rig.pose('pe_l', -12, 0, -6)
    rig.pose('braco_r', -20, 0, -14)
    rig.pose('antebraco_r', -38, 0, 0)
    rig.pose('braco_l', 12, 0, 16)
    rig.pose('antebraco_l', -20, 0, 0)
    rig.pose('cabeca', 4, 0, -8)
    rig.pose('corpo', 0, 0, 6)
