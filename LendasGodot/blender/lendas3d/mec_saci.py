"""SACI — "O Redemoinho" (versão mecanizada).

Armadura-relicário leve e saltitante. Traços da lenda mantidos: uma perna só (aqui uma perna-mola
central com amortecedor e mola helicoidal, feita para pular), gorro vermelho (em gomos telescópicos
que caem para trás, com uma pequena hélice na ponta), cachimbo com brasa e fumaça, e o redemoinho
(turbinas no peito, nas costas e nos pulsos; propulsores de vento nos quadris e no calcanhar).
"""
import numpy as np
from math import tau, pi, cos, sin, radians

from . import geo, kit, mats, parts
from .parts import C, CU, RU, JA, BO, AC, BR, NU, VI, EX, Builder, align_y, keel, bulge, seam_plates

ID = 'saci'
F = geo.FRONT
HERO_COLOR = (0.9, 0.06, 0.05)
WIND = (0.3, 0.85, 1.0)
HEIGHT = 1.75


def materials():
    return {
        'carvao': mats.make('saci_grafite', (0.042, 0.047, 0.056), 0.8, 0.34, 'metal'),
        'cobre': mats.make('saci_latao', (0.85, 0.6, 0.28), 1.0, 0.24, 'metal'),
        'rubro': mats.make('saci_carmim', (0.48, 0.012, 0.018), 0.3, 0.28, 'paint', coat=0.6),
        'jade': mats.make('saci_marfim', (0.7, 0.66, 0.58), 0.1, 0.34, 'paint', coat=0.4),
        'borracha': mats.make('saci_borracha', (0.011, 0.011, 0.012), 0.0, 0.55, 'rubber'),
        'aco': mats.make('saci_aco', (0.62, 0.63, 0.66), 1.0, 0.18, 'metal'),
        'brasa': mats.make('saci_vento', (0.02, 0.08, 0.1), 0.0, 0.5, 'emit', WIND, 2.0),
        'nucleo': mats.make('saci_nucleo', (0.1, 0.2, 0.25), 0.0, 0.4, 'emit', (0.7, 0.95, 1.0), 3.0),
        'visor': mats.make('saci_lente', (0.003, 0.005, 0.008), 0.2, 0.05, 'glass'),
        'extra': mats.make('saci_brasa', (0.1, 0.02, 0.0), 0.0, 0.5, 'emit', (1.0, 0.32, 0.04), 3.0),
    }


# ====================================================================== perna única (mola)
def leg(b):
    r = b.r
    H = np.array((0.0, 0.0, 0.64))
    K = np.array((0.0, -0.075, 0.40))
    A = np.array((0.0, 0.035, 0.13))
    r.pivot('perna', H, 'corpo')
    r.pivot('pe', A, 'perna')
    b.part('perna', geo.ellipsoid(H, (0.07, 0.07, 0.07), nu=28, nv=14, m=C), None, 1)
    th = geo.LoftSurf([H + (0, 0, 0.02), (0, -0.03, 0.55), (0, -0.062, 0.46), K + (0, 0, 0.01)],
                      a=[0.075, 0.082, 0.072, 0.056], b=[0.08, 0.084, 0.072, 0.056], p=2.8)
    b.part('perna', th.tube(26, 26, m=BO), None, 1)
    vf, vo, vb = (kit.vdir(th, 0.5, d) for d in (F, (1, 0, 0), (0, 1, 0)))
    b.part('perna', geo.plate(th, 0.06, 0.9, lambda u: vf - (0.16 - 0.04 * u), lambda u: vf + (0.16 - 0.04 * u), 16, 10, 0.008, 0.022, RU, thick_fn=keel(0.8)))
    for (u0, u1) in ((0.12, 0.42), (0.46, 0.8)):
        b.sym('perna', geo.plate(th, u0, u1, vo - 0.1, vo + 0.1, 8, 8, 0.008, 0.016, C), (0.004, 2))
    b.sym('perna', geo.plate(th, 0.13, 0.79, vo - 0.085, vo + 0.085, 10, 6, 0.003, 0.005, BR), None, 1)
    b.part('perna', geo.plate(th, 0.1, 0.8, vb - 0.13, vb + 0.13, 12, 8, 0.008, 0.018, C, thick_fn=bulge(0.6, 0.6)))
    b.part('perna', geo.plate(th, 0.02, 0.07, 0.0, 1.0, 3, 32, 0.004, 0.012, CU, wrap=True), (0.003, 2), 1)
    # joelho
    b.part('perna', geo.lathe([(0.0, -0.07), (0.03, -0.07), (0.045, -0.062), (0.047, -0.044), (0.04, -0.04), (0.04, 0.04), (0.047, 0.044),
                               (0.045, 0.062), (0.03, 0.07), (0.0, 0.07)], 28, K, (1, 0, 0), m=CU), (0.003, 2), 1)
    kc = geo.EllipsoidSurf(K + (0, -0.04, 0.01), (0.058, 0.04, 0.066))
    for (u0, u1) in ((-0.2, -0.026), (0.026, 0.2)):
        b.part('perna', geo.plate(kc, u0, u1, 0.18, 0.86, 10, 12, 0.0, 0.02, C), (0.004, 2))
    b.part('perna', geo.lathe([(0.0, 0.0), (0.016, 0.0), (0.02, 0.01), (0.015, 0.02), (0.0, 0.023)], 20, K + (0, -0.075, 0.01), F, m=NU), None, 1)
    # canela-amortecedor: camisa, haste, mola helicoidal e duas escoras laterais
    d = geo.unit(A - K)
    b.part('perna', geo.piston(K + d * 0.02, A - d * 0.01, 0.03, C, AC, CU, n=24, sleeve_frac=0.45), (0.003, 2), 1)
    b.part('perna', geo.spring(K + d * 0.15, A - d * 0.035, 0.05, 0.0085, 7.5, CU, 10), None, 1)
    for p0, p1 in ((K + d * 0.12, A - d * 0.03),):
        b.part('perna', geo.ring_band(p0, d, 0.034, 0.06, 0.012, 40, C), (0.002, 1), 1)
        b.part('perna', geo.ring_band(p1, d, 0.03, 0.058, 0.012, 40, C), (0.002, 1), 1)
    for sx in (1, -1):
        b.part('perna', geo.cyl(K + (0.045 * sx, 0, -0.02), A + (0.042 * sx, 0, 0.03), 0.009, 12, m=C), (0.002, 1), 1)
    sh = geo.LoftSurf([K + d * 0.03, K + d * 0.2, A - d * 0.12], a=[0.068, 0.07, 0.062], b=[0.066, 0.068, 0.06], p=2.6, ref=F)
    vfs = kit.vdir(sh, 0.5, F)
    b.part('perna', geo.plate(sh, 0.0, 0.62, lambda u: vfs - (0.18 - 0.06 * u), lambda u: vfs + (0.18 - 0.06 * u), 12, 10, 0.004, 0.018, RU, thick_fn=keel(0.7)))
    # tornozelo e pé (dedos para a frente; propulsor no calcanhar)
    b.part('pe', geo.lathe([(0.0, -0.06), (0.03, -0.06), (0.042, -0.05), (0.042, 0.05), (0.03, 0.06), (0.0, 0.06)], 24, A, (1, 0, 0), m=CU), (0.003, 2), 1)
    b.part('pe', geo.box(A + (0, 0.03, -0.06), (0.1, 0.09, 0.075), geo.euler(-10, 0, 0), C), (0.012, 3))
    b.part('pe', geo.box(A + (0, -0.07, -0.085), (0.1, 0.16, 0.06), geo.euler(4, 0, 0), C), (0.012, 3))
    b.part('pe', geo.box(A + (0, -0.04, -0.045), (0.085, 0.11, 0.02), geo.euler(12, 0, 0), RU), (0.006, 2))
    b.part('pe', geo.box(A + (0, -0.03, -0.124), (0.11, 0.3, 0.014), None, BO), (0.005, 2), 1)
    toes = geo.Cage()
    claws = geo.Cage()
    for dx, splay in ((-0.032, 10.0), (0.0, 0.0), (0.032, -10.0)):
        base = A + (dx, -0.145, -0.1)
        dd = geo.rot((0, 0, 1), radians(splay)) @ geo.rot((1, 0, 0), radians(-6)) @ np.array((0, -1.0, 0))
        toes.merge(geo.box(base + dd * 0.03, (0.028, 0.06, 0.036), align_y(dd), C))
        toes.merge(geo.box(base + dd * 0.085, (0.025, 0.05, 0.03), align_y(dd), RU))
        claws.merge(geo.cyl(base + dd * 0.058 - (0.017, 0, 0), base + dd * 0.058 + (0.017, 0, 0), 0.011, 12, m=CU))
    b.part('pe', toes, (0.007, 3))
    b.part('pe', claws, (0.002, 1), 1)
    nd = geo.unit((0, 0.6, -1.0))
    b.part('pe', geo.lathe([(0.0, 0.0), (0.024, 0.0), (0.024, 0.03), (0.03, 0.05), (0.026, 0.054), (0.018, 0.044), (0.0, 0.044)],
                           20, A + (0, 0.07, -0.03), nd, m=C), (0.002, 1), 1)
    b.part('pe', geo.lathe([(0.0, 0.0), (0.018, 0.0), (0.018, 0.004), (0.0, 0.004)], 16, A + (0, 0.07, -0.03) + nd * 0.042, nd, m=BR), None, 0)
    r.anchor('FX_pe', A + (0, 0.07, -0.03) + nd * 0.06, 'pe')


# ====================================================================== quadril, tronco e turbinas
def torso(b):
    r = b.r
    ts = geo.LoftSurf([(0, 0.0, 0.72), (0, 0.0, 0.8), (0, -0.005, 0.88), (0, -0.01, 0.96), (0, 0.0, 1.03), (0, 0.006, 1.075)],
                      a=[0.1, 0.085, 0.09, 0.106, 0.096, 0.06], b=[0.13, 0.11, 0.126, 0.152, 0.136, 0.065],
                      p=[3.0, 2.6, 2.8, 3.2, 3.0, 2.4], offN=[0.0, 0.0, 0.004, 0.01, 0.004, -0.006], ref=F)
    uz = ts.u_at
    b.part('corpo', ts.tube(40, 36, m=BO), None, 1)
    b.part('corpo', geo.ellipsoid((0, 0.0, 0.69), (0.13, 0.1, 0.08), (3.0, 3.0), None, 32, 16, BO), None, 1)
    b.part('corpo', geo.lathe([(0.075, 0.0), (0.096, 0.01), (0.1, 0.04), (0.086, 0.062), (0.07, 0.066)], 36, (0, 0, 0.6), (0, 0, 1), m=C, caps=False), (0.004, 2), 1)
    sk = geo.EllipsoidSurf((0, 0.0, 0.73), (0.158, 0.128, 0.15), (2.2, 3.0))
    for (u0, u1, m) in ((-0.07, 0.07, C), (0.43, 0.57, C)):
        b.part('corpo', geo.plate(sk, u0, u1, 0.22, 0.48, 8, 10, 0.0, 0.016, m))
        b.part('corpo', geo.plate(sk, u0 + 0.004, u1 - 0.004, 0.22, 0.25, 3, 8, 0.014, 0.006, CU), (0.002, 1), 1)

    def side(UN, VN):
        u = 0.16 + 0.18 * UN
        vlow = 0.2 - 0.06 * np.maximum(0, np.sin(UN * np.pi * 2.0)) ** 2
        return u, vlow + (0.47 - vlow) * VN
    b.sym('corpo', geo.plate(sk, nu=12, nv=12, off=0.006, thick=0.016, m=RU, uvfn=side, thick_fn=keel(0.5, 0.25)))
    # propulsores de vento nos quadris
    for sx in (1, -1):
        base = np.array((0.14 * sx, 0.03, 0.67))
        nd = geo.unit((0.3 * sx, 0.3, -1.0))
        b.part('corpo', geo.lathe([(0.0, 0.0), (0.03, 0.0), (0.03, 0.05), (0.036, 0.08), (0.032, 0.085), (0.022, 0.07), (0.0, 0.07)], 24, base, nd, m=C), (0.002, 1), 1)
        b.part('corpo', geo.ring_band(base + nd * 0.03, nd, 0.029, 0.035, 0.01, 32, CU), (0.0015, 1), 1)
        b.part('corpo', geo.lathe([(0.0, 0.0), (0.022, 0.0), (0.022, 0.004), (0.0, 0.004)], 16, base + nd * 0.068, nd, m=BR), None, 0)
        r.anchor('FX_propulsor_' + ('r' if sx > 0 else 'l'), base + nd * 0.1, 'corpo')
    # cinto e fivela
    b.part('corpo', geo.plate(ts, uz(0.755), uz(0.79), 0.0, 1.0, 4, 40, 0.004, 0.014, CU, wrap=True), (0.003, 2), 1)
    pb = ts.eval(uz(0.772), 0.0)
    b.part('corpo', geo.lathe([(0.0, 0.0), (0.034, 0.0), (0.038, 0.01), (0.03, 0.018), (0.0, 0.02)], 28, pb + (0, -0.01, 0), F, m=CU), (0.002, 2), 1)
    b.part('corpo', geo.lathe([(0.0, 0.0), (0.018, 0.0), (0.02, 0.022), (0.0, 0.026)], 20, pb + (0, -0.01, 0), F, m=NU), None, 1)
    # abdômen
    for (z0, z1) in ((0.795, 0.83), (0.836, 0.871)):
        b.sym('corpo', geo.plate(ts, uz(z0), uz(z1), 0.012, 0.09, 5, 7, 0.006, 0.014, C, thick_fn=bulge(0.5, 0.7)), (0.004, 2))
    b.part('corpo', geo.plate(ts, uz(0.79), uz(0.876), -0.014, 0.014, 6, 3, 0.002, 0.004, BR), None, 1)
    b.sym('corpo', geo.cable([(0.13, 0.0, 0.94), (0.118, 0.02, 0.85), (0.11, 0.015, 0.78)], 0.011, 10, ribs=12, m=BO), None, 0)

    # peito com porta da turbina central
    def pec(UN, VN):
        ub = uz(0.885 + 0.05 * VN)
        ut = uz(1.035 - 0.02 * VN)
        return ub + (ut - ub) * UN, 0.045 + 0.17 * VN
    b.sym('corpo', geo.plate(ts, nu=12, nv=10, off=0.006, thick=0.024, m=C, uvfn=pec, thick_fn=bulge(0.6, 0.6)))
    b.part('corpo', geo.plate(ts, uz(1.0), uz(1.05), -0.11, 0.11, 5, 14, 0.012, 0.016, JA))
    b.part('corpo', geo.plate(ts, uz(1.045), uz(1.075), 0.0, 1.0, 3, 36, 0.004, 0.018, CU, wrap=True), (0.003, 2), 1)
    b.sym('corpo', geo.plate(ts, uz(1.0), uz(1.072), 0.13, 0.3, 6, 8, 0.004, 0.016, C))
    pc = ts.eval(uz(0.945), 0.0) + F * 0.02
    duct, rotor, back = parts.ducted_fan(pc, F, 0.05, 14, 0.035, C, CU, AC, CU, BR, ref=(0, 0, 1))
    b.part('corpo', duct, (0.002, 2), 1)
    b.part('corpo', back, None, 0)
    r.pivot('GIRO_peito', pc, 'corpo', axis=F)
    b.part('GIRO_peito', rotor, (0.0015, 1), 1)
    # mochila-turbina nas costas (o redemoinho nasce aqui)
    bp = np.array((0.0, 0.135, 0.94))
    b.part('corpo', geo.box(bp, (0.21, 0.085, 0.21), None, C), (0.022, 3))
    b.part('corpo', geo.box(bp + (0, -0.01, 0.0), (0.225, 0.07, 0.06), None, RU), (0.01, 2))
    tc = bp + (0, 0.065, 0.0)
    duct, rotor, back = parts.ducted_fan(tc, (0, 1, 0), 0.08, 16, 0.05, C, CU, AC, CU, BR, ref=(0, 0, 1))
    b.part('corpo', duct, (0.002, 2), 1)
    b.part('corpo', back, None, 0)
    r.pivot('GIRO_costas', tc, 'corpo', axis=(0, 1, 0))
    b.part('GIRO_costas', rotor, (0.0015, 1), 1)
    r.anchor('FX_turbina', tc + (0, 0.08, 0), 'corpo')
    for sx in (1, -1):
        b.part('corpo', geo.vent(bp + (0.112 * sx, 0.0, -0.02), geo.euler(0, 0, 90), 0.06, 0.12, 5, 0.012, 0.004, 30, C, CU, BR), (0.001, 1), 0)
        b.part('corpo', geo.cable([bp + (0.09 * sx, 0.02, -0.1), (0.13 * sx, 0.07, 0.74), (0.14 * sx, 0.05, 0.7)], 0.0105, 10, ribs=14, m=BO), None, 0)
    return ts


# ====================================================================== braços com turbinas de pulso
def arms(b):
    r = b.r
    x = 0.19
    S = np.array((x, 0.0, 1.0))
    E = np.array((x, 0.0, 0.78))
    W = np.array((x, -0.004, 0.575))
    M = np.array((-1.0, 1.0, 1.0))
    r.pivot('braco_r', S, 'corpo')
    r.pivot('braco_l', S * M, 'corpo')
    r.pivot('antebraco_r', E, 'braco_r')
    r.pivot('antebraco_l', E * M, 'braco_l')
    r.pivot('mao_r', W, 'antebraco_r')
    r.pivot('mao_l', W * M, 'antebraco_l')
    ua = geo.LoftSurf([S, (x + 0.002, -0.004, 0.9), (x, 0.0, 0.79)], a=[0.048, 0.05, 0.04], b=[0.046, 0.048, 0.038], p=2.6)
    b.pair('braco_r', 'braco_l', ua.tube(22, 22, m=BO), None, 1)
    b.pair('braco_r', 'braco_l', geo.ellipsoid(S, (0.055, 0.055, 0.055), nu=24, nv=12, m=C), None, 1)
    vf, vo, vb = (kit.vdir(ua, 0.5, d) for d in (F, (1, 0, 0), (0, 1, 0)))
    b.pair('braco_r', 'braco_l', geo.plate(ua, 0.22, 0.88, vf - 0.16, vf + 0.16, 10, 8, 0.006, 0.016, C, thick_fn=bulge(0.6, 0.6)))
    b.pair('braco_r', 'braco_l', geo.plate(ua, 0.2, 0.84, vb - 0.15, vb + 0.15, 10, 8, 0.006, 0.014, C))
    seam_plates(b, 'braco_r', 'braco_l', ua, [(0.3, 0.55), (0.58, 0.82)], vo, 0.09, 0.006, 0.012)
    # ombreira pequena (carmim com friso de latão)
    pd = geo.EllipsoidSurf(S + (0.01, 0.0, 0.018), (0.078, 0.076, 0.068), (2.6, 2.6))

    def shell(UN, VN):
        u = -0.06 + 0.62 * UN
        vlow = 0.38 - 0.08 * np.maximum(0, np.sin(UN * np.pi * 2.0)) ** 2
        return u, vlow + (0.975 - vlow) * VN
    b.pair('braco_r', 'braco_l', geo.plate(pd, nu=18, nv=12, off=0.008, thick=0.018, m=RU, uvfn=shell))
    b.pair('braco_r', 'braco_l', geo.plate(pd, 0.0, 0.5, 0.26, 0.42, 10, 4, 0.002, 0.012, C))
    b.pair('braco_r', 'braco_l', geo.plate(pd, -0.05, 0.55, 0.385, 0.41, 14, 3, 0.026, 0.006, CU), (0.002, 1), 1)
    # cotovelo e antebraço
    b.pair('antebraco_r', 'antebraco_l', geo.lathe([(0.0, -0.05), (0.024, -0.05), (0.034, -0.044), (0.034, 0.044), (0.024, 0.05), (0.0, 0.05)],
                                                   20, E, (1, 0, 0), m=CU), (0.002, 2), 1)
    fa = geo.LoftSurf([E + (0, 0, -0.01), (x + 0.002, -0.004, 0.68), W + (0, 0.004, 0.015)], a=[0.044, 0.054, 0.044], b=[0.043, 0.052, 0.042], p=3.0)
    b.pair('antebraco_r', 'antebraco_l', fa.tube(20, 22, m=BO), None, 1)
    vf, vo, vi, vb = (kit.vdir(fa, 0.5, d) for d in (F, (1, 0, 0), (-1, 0, 0), (0, 1, 0)))
    b.pair('antebraco_r', 'antebraco_l', geo.plate(fa, 0.05, 0.86, vf - 0.17, vf + 0.17, 12, 8, 0.006, 0.018, RU, thick_fn=bulge(0.5, 0.75)))
    b.pair('antebraco_r', 'antebraco_l', geo.plate(fa, 0.08, 0.84, vi - 0.16, vi + 0.16, 10, 8, 0.006, 0.014, C))
    b.pair('antebraco_r', 'antebraco_l', geo.plate(fa, 0.86, 0.97, 0.0, 1.0, 4, 28, 0.005, 0.014, CU, wrap=True), (0.003, 2), 1)
    # turbina de pulso (lado de fora/trás do antebraço) — sopra para baixo
    fc = E + (0.06, 0.03, -0.12)
    fdir = geo.unit((0.22, 0.12, -1.0))
    duct, rotor, back = parts.ducted_fan(fc, fdir, 0.036, 10, 0.03, C, CU, AC, CU, None, ref=(1, 0, 0))
    b.pair('antebraco_r', 'antebraco_l', duct, (0.0015, 2), 1)
    b.pair('antebraco_r', 'antebraco_l', geo.box(fc + (-0.025, -0.012, 0.0), (0.03, 0.03, 0.05), None, C), (0.006, 2), 1)
    r.pivot('GIRO_pulso_r', fc, 'antebraco_r', axis=fdir)
    r.pivot('GIRO_pulso_l', fc * M, 'antebraco_l', axis=fdir * M)
    b.pair('GIRO_pulso_r', 'GIRO_pulso_l', rotor, (0.001, 1), 1)
    r.anchor('FX_pulso_r', fc + fdir * 0.05, 'antebraco_r')
    r.anchor('FX_pulso_l', (fc + fdir * 0.05) * M, 'antebraco_l')
    parts.hand(b, 'mao_r', 'mao_l', W, s=0.82, fingers=3)


# ====================================================================== cabeça, gorro e cachimbo
def head(b):
    r = b.r
    Hd = np.array((0.0, -0.012, 1.11))
    r.pivot('cabeca', Hd, 'corpo')
    prof = [(0.036 if k % 2 == 0 else 0.041, 1.06 + k * 0.009) for k in range(10)]
    b.part('cabeca', geo.lathe(prof, 24, (0, 0.0, 0), (0, 0, 1), m=BO), (0.002, 1), 1)
    c0 = np.array((0.0, -0.01, 1.235))
    b.part('cabeca', geo.ellipsoid(c0, (0.11, 0.105, 0.115), (2.3, 2.3), None, 36, 20, C), None, 1)
    hs = geo.EllipsoidSurf(c0, (0.118, 0.113, 0.123), (2.5, 2.5))
    # máscara de marfim, nuca de grafite com aletas
    b.part('cabeca', geo.plate(hs, -0.17, 0.17, 0.37, 0.66, 18, 10, 0.0, 0.014, JA))
    b.part('cabeca', geo.plate(hs, -0.15, 0.15, 0.16, 0.262, 16, 6, 0.0, 0.014, JA))
    b.sym('cabeca', geo.plate(hs, 0.1, 0.17, 0.262, 0.37, 5, 6, 0.0, 0.014, JA))
    b.part('cabeca', geo.plate(hs, 0.22, 0.78, 0.3, 0.7, 16, 10, 0.0, 0.014, C))
    for k in range(5):
        u = 0.36 + k * 0.07
        b.part('cabeca', geo.plate(hs, u - 0.012, u + 0.012, 0.32, 0.62, 3, 8, 0.012, 0.012, CU), (0.002, 1), 1)
    # olhos-lente grandes (o direito maior: cara de travessura), pálpebra no esquerdo
    for sx, rr in ((1, 0.04), (-1, 0.034)):
        e = np.array((0.05 * sx, -0.118, 1.258))
        b.part('cabeca', geo.lathe([(0.0, -0.01), (rr, -0.01), (rr * 1.08, 0.004), (rr * 0.95, 0.016), (rr * 0.8, 0.012)], 32, e, F, m=CU), (0.002, 2), 1)
        b.part('cabeca', geo.lathe([(0.0, 0.0), (rr * 0.8, 0.0), (rr * 0.72, 0.012), (rr * 0.4, 0.02), (0.0, 0.022)], 28, e + F * 0.004, F, m=VI), None, 1)
        b.part('cabeca', geo.ring_band(e + F * 0.014, F, rr * 0.36, rr * 0.55, 0.004, 32, BR), (0.001, 1), 0)
        b.part('cabeca', geo.lathe([(0.0, 0.0), (rr * 0.22, 0.0), (rr * 0.18, 0.008), (0.0, 0.01)], 16, e + F * 0.018, F, m=NU), None, 0)
    lid = geo.EllipsoidSurf((-0.05, -0.112, 1.258), (0.04, 0.03, 0.04))
    b.part('cabeca', geo.plate(lid, -0.24, 0.24, 0.58, 0.95, 10, 8, 0.0, 0.008, C), (0.002, 1))
    # sorriso: fileira curva de dentes de latão sobre uma fresta luminosa
    grin = geo.Cage()
    for k in range(9):
        t = (k - 4) / 4.0
        P, N = hs.grid2(np.array([[t * 0.078]]), np.array([[0.31 + 0.045 * t * t]]))
        p, n = P[0, 0], N[0, 0]
        Rk = np.stack([geo.unit(np.cross((0, 0, 1), n)), -n, np.array((0, 0, 1.0))], 1)
        grin.merge(geo.box(p + n * 0.006, (0.011, 0.014, 0.03 - abs(t) * 0.008), Rk @ geo.euler(0, -t * 18, 0), CU))
    b.part('cabeca', grin, (0.0015, 1), 1)
    b.part('cabeca', geo.plate(hs, -0.1, 0.1, 0.262, 0.37, 12, 5, 0.0, 0.006, BR), None, 1)
    # orelhas-disco
    for sx in (1, -1):
        b.part('cabeca', geo.lathe([(0.0, 0.0), (0.042, 0.0), (0.046, 0.008), (0.04, 0.02), (0.026, 0.024), (0.0, 0.024)], 32,
                                   (0.108 * sx, 0.0, 1.24), (sx, 0, 0), m=CU), (0.002, 2), 1)
        b.part('cabeca', geo.ring_band((0.13 * sx, 0.0, 1.24), (sx, 0, 0), 0.012, 0.028, 0.004, 32, BR), (0.001, 1), 0)
        b.part('cabeca', geo.extrude([(0.0, 0.0), (0.02, 0.01), (0.07, 0.07), (0.03, 0.05), (0.0, 0.02)], 0.008,
                                     (0.115 * sx, 0.02, 1.27), (0, 1, 0), geo.unit((0.4 * sx, 0, 1)), C), (0.002, 1), 1)

    # ---------------- gorro em gomos telescópicos, caindo para trás, com hélice na ponta
    Hc = np.array((0.0, 0.0, 1.36))
    r.pivot('gorro', Hc, 'cabeca')
    path = [(0, 0.0, 1.33), (0, 0.012, 1.425), (0.005, 0.07, 1.505), (0.025, 0.16, 1.545), (0.052, 0.255, 1.515), (0.07, 0.32, 1.435), (0.075, 0.338, 1.355)]
    cs = geo.LoftSurf(path, a=[0.122, 0.108, 0.088, 0.068, 0.05, 0.034, 0.022], b=[0.124, 0.11, 0.09, 0.07, 0.051, 0.035, 0.022], p=2.2, ref=(0, -1, 0))
    b.part('gorro', geo.ring_band((0, 0.0, 1.335), (0, 0, 1), 0.112, 0.132, 0.03, 64, CU), (0.003, 2), 1)
    b.part('gorro', cs.tube(48, 28, m=BR, u0=0.0, u1=0.985), None, 1)
    n = 8
    for k in range(n):
        u0 = k / n * 0.97
        u1 = (k + 1) / n * 0.97 - 0.008
        b.part('gorro', geo.plate(cs, u0, u1, 0.0, 1.0, 8, 32, 0.003, 0.009, RU, wrap=True,
                                  thick_fn=lambda U, V: 1.0 + 0.7 * (1 - U) ** 4), (0.0025, 2), 3 if k < 4 else 2)
        b.part('gorro', geo.plate(cs, u0, u0 + 0.012, 0.0, 1.0, 2, 32, 0.014, 0.004, CU, wrap=True), (0.0015, 1), 1)
    P, T, N, B = cs.frame_at(0.985)
    tip = P + T * 0.012
    r.pivot('GIRO_gorro', tip, 'gorro', axis=T)
    b.part('GIRO_gorro', geo.fan(tip, T, 0.01, 0.07, 3, 0.022, 0.003, 0.5, CU, RU), (0.0015, 1), 1)
    b.part('gorro', geo.ellipsoid(tip + T * 0.03, (0.014, 0.014, 0.014), nu=16, nv=8, m=NU), None, 1)
    r.anchor('FX_gorro', tip + T * 0.04, 'gorro')

    # ---------------- cachimbo: haste curva saindo do canto da boca, fornilho com aletas e brasa
    P, N = hs.grid2(np.array([[0.075]]), np.array([[0.315]]))
    pm = P[0, 0] + N[0, 0] * 0.004
    r.pivot('cachimbo', pm, 'cabeca')
    stem = [pm, pm + (0.025, -0.045, -0.014), pm + (0.055, -0.085, -0.008), pm + (0.068, -0.1, 0.006)]
    b.part('cachimbo', geo.cable(stem, 0.0075, 12, m=C), (0.001, 1), 1)
    for t in (0.35, 0.65):
        q = geo.catmull(stem, 8)[int(t * 24)]
        b.part('cachimbo', geo.ring_band(q, (0.55, -0.83, 0.0), 0.007, 0.0105, 0.006, 20, CU), (0.001, 1), 1)
    bw = pm + np.array((0.07, -0.104, 0.03))
    b.part('cachimbo', geo.lathe([(0.0, -0.03), (0.017, -0.03), (0.026, -0.012), (0.029, 0.016), (0.026, 0.032), (0.021, 0.028), (0.0, 0.028)],
                                 24, bw, (0, 0, 1), m=C), (0.002, 2), 1)
    for h in (-0.008, 0.003, 0.014):
        b.part('cachimbo', geo.ring_band(bw + (0, 0, h), (0, 0, 1), 0.027, 0.035, 0.004, 32, CU), (0.001, 1), 1)
    b.part('cachimbo', geo.lathe([(0.0, 0.0), (0.02, 0.0), (0.019, 0.006), (0.0, 0.008)], 20, bw + (0, 0, 0.024), (0, 0, 1), m=EX), None, 1)
    r.anchor('FX_cachimbo', bw + (0, 0, 0.045), 'cachimbo')


def build(detail=2):
    M = materials()
    rig = kit.Rig(ID, M)
    rig.pivot('corpo', (0, 0, 0), ID)
    b = Builder(rig, detail)
    leg(b)
    torso(b)
    arms(b)
    head(b)
    rig.finalize()
    return rig


# ====================================================================== apresentação (render)
def pose_hero(rig, air=0.0):
    rig.pose('corpo', 6, 0, -6)
    rig.pose('perna', -10, 0, 0)
    rig.pose('pe', 18, 0, 0)
    rig.pose('braco_r', -30, 0, -50)
    rig.pose('antebraco_r', -50, 0, 0)
    rig.pose('mao_r', 0, 0, 0)
    rig.pose('braco_l', 10, 0, 34)
    rig.pose('antebraco_l', -35, 0, 0)
    rig.pose('cabeca', 6, 0, 10)
    rig.pose('gorro', -14, 0, 6)
    rig.pose('GIRO_peito', 0, 0, 0)


def present(rig, mode, a, path):
    from . import stage, fx
    import bpy
    w, h = map(int, a.res.split('x'))
    if mode == 'retrato':
        w, h = 1080, 1350
    stage.setup_render((w, h), a.samples, 0.05, volumetric=True)
    stage.world(horizon=(0.03, 0.03, 0.045), zenith=(0.004, 0.005, 0.009), fog=0.006, fog_color=(0.7, 0.85, 1.0))
    stage.studio(HERO_COLOR, rim2=WIND, key_energy=650, rim_energy=1100, top_energy=1300)
    top = stage.pedestal(HERO_COLOR)
    stage.halo((0.25, 0.75, 1.0), (0, 3.6, 2.0), 2.0, 0.6)
    air = 0.18

    def attach(ob, pivot):
        p = rig.nodes[pivot]
        bpy.context.view_layer.update()
        ob.parent = p
        ob.matrix_parent_inverse = p.matrix_world.inverted()
        return ob

    if not a.nofx:
        rng = np.random.default_rng(21)
        windm = fx.ribbon_material('saci_fita', (0.75, 0.95, 1.0), 2.6, 0.55)
        windm2 = fx.ribbon_material('saci_fita_poeira', (0.95, 0.8, 0.55), 1.2, 0.45)
        dust = mats.make('saci_poeira', (0.42, 0.33, 0.22), 0.0, 0.9, 'paint', detail=0.0)
        leafm = mats.make('saci_folha', (0.12, 0.2, 0.05), 0.0, 0.6, 'paint', detail=0.0)
        leafm2 = mats.make('saci_folha_seca', (0.45, 0.25, 0.06), 0.0, 0.6, 'paint', detail=0.0)
        spark = mats.emission_only('saci_faisca', (0.6, 0.92, 1.0), 4.0)[0]
        ember = mats.emission_only('saci_fagulha', (1.0, 0.4, 0.06), 5.0)[0]
        # ---- redemoinho em volta do Saci: fitas, funil de poeira, folhas e poeira
        fx.wind_ribbons('vento_fitas', (0, 0, top), 34, 0.32, 0.95, 1.9, windm, seed=1, width=0.016, turns=(0.5, 1.2))
        fx.wind_ribbons('vento_poeira', (0, 0, top), 18, 0.42, 1.2, 1.5, windm2, seed=2, width=0.03, turns=(0.4, 0.9))
        tm = fx.volume_material('saci_funil', 'tornado', 0.6, 5.0, (3.0, 3.0, 1.2), 2.0, fx.BLUE_STOPS, smoke_color=(0.55, 0.48, 0.38), cutoff=0.32, swirl=9.0)
        fx.volume_domain('funil', (0, 0, top), 1.15, 2.0, tm)
        fx.motes('folhas', (0, 0, top + 0.1), 70, 1.2, 1.8, 0.03, leafm, seed=3, flat=True)
        fx.motes('folhas_secas', (0, 0, top + 0.1), 50, 1.3, 1.7, 0.028, leafm2, seed=4, flat=True)
        fx.motes('poeira', (0, 0, top), 260, 1.4, 1.2, 0.006, dust, seed=5)
        fx.streaks('faiscas_vento', (0, 0, top + 0.2), 70, 0.9, 1.6, spark, seed=6, length=(0.04, 0.12), thick=0.0018, up=0.25, swirl=2.5)
        # anel de poeira no chão (impacto do pulo)
        ring_roots = [(cos(t) * 0.45, sin(t) * 0.45, top + 0.01) for t in np.linspace(0, tau, 40, endpoint=False)]
        ring_dirs = [(cos(t), sin(t), 0.35) for t in np.linspace(0, tau, 40, endpoint=False)]
        fx.tongues('anel_poeira', ring_roots, ring_dirs, rng.uniform(0.15, 0.3, 40), rng.uniform(0.03, 0.05, 40),
                   fx.tongue_material('saci_poeira_jato', 1.0, [(0.0, (0.9, 0.8, 0.6)), (0.5, (0.7, 0.6, 0.45)), (1.0, (0.5, 0.45, 0.35))]), seed=7)
        # ---- cachimbo: fumaça clara subindo em espiral + fagulhas
        tip = np.asarray(rig.world['FX_cachimbo'])
        attach(fx.smoke_volume('fumaca_cachimbo', tip, 0.12, 0.9, density=3.0, seed=3.3, color=(0.7, 0.7, 0.72)), 'cachimbo')
        attach(fx.streaks('fagulhas_cachimbo', tip, 18, 0.03, 0.18, ember, seed=8, length=(0.01, 0.03), thick=0.0015), 'cachimbo')
        # ---- jatos de vento: propulsores dos quadris, calcanhar e pulsos
        jet = fx.tongue_material('saci_jato', 2.2, fx.BLUE_STOPS)
        jets = (('FX_propulsor_r', 'corpo', (0.3, 0.3, -1.0)), ('FX_propulsor_l', 'corpo', (-0.3, 0.3, -1.0)), ('FX_pe', 'pe', (0, 0.6, -1.0)),
                ('FX_pulso_r', 'antebraco_r', (0.22, 0.12, -1.0)), ('FX_pulso_l', 'antebraco_l', (-0.22, 0.12, -1.0)))
        for nm, pv, dv in jets:
            p0 = np.asarray(rig.world[nm])
            d = geo.unit(dv)
            L = 0.32 if nm == 'FX_pe' else 0.22
            attach(fx.tongues('jato_' + nm, [p0] * 4, [d + rng.normal(0, 0.08, 3) for _ in range(4)], rng.uniform(L * 0.6, L, 4),
                              rng.uniform(0.018, 0.028, 4), jet, seed=9), pv)
        # ---- arcos de energia entre as turbinas dos pulsos e a do peito
        arcm = mats.emission_only('saci_arco', (0.6, 0.9, 1.0), 6.0)[0]
        for i, (nm, pv) in enumerate((('FX_pulso_r', 'antebraco_r'),)):
            p0 = np.asarray(rig.world[nm])
            attach(fx.bolt_arc('arco_' + nm, p0, p0 + (0.12, -0.08, 0.12), arcm, seed=10 + i, amp=0.03, thick=0.0025), pv)
        # ---- luzes
        for nm, pv, e, col in (('luz_peito', 'GIRO_peito', 20.0, (0.5, 0.9, 1.0)), ('luz_costas', 'FX_turbina', 30.0, (0.5, 0.9, 1.0)),
                               ('luz_cachimbo', 'FX_cachimbo', 6.0, (1.0, 0.45, 0.1)), ('luz_gorro', 'FX_gorro', 8.0, (0.5, 0.9, 1.0))):
            L = stage.point_light(nm, np.asarray(rig.world[pv]) + (0, -0.03, 0), e, col, 0.05)
            attach(L, rig.nodes[pv].parent.name if pv.startswith('FX_') else pv)
    rig.root.location.z = top + air
    pose_hero(rig)
    if mode == 'retrato':
        stage.camera((1.0, -3.3, 0.85 + top), (0.0, 0.0, 1.0 + top), 44, 2.4, focus=(0.0, -0.1, 1.2 + top))
    elif mode == 'close':
        stage.camera((0.45, -1.35, 1.45 + top), (0.0, 0.0, 1.32 + top), 55, 1.8, focus=(0.0, -0.1, 1.3 + top))
    else:
        stage.camera((1.3, -4.1, 0.75 + top), (0.05, 0.0, 0.98 + top), 38, 2.8, focus=(0.0, -0.1, 1.1 + top))
    stage.render(path)
