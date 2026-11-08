"""Geometria-base das peças mecânicas ("gaiolas" de média resolução).

Cada função devolve um ``Cage`` (vértices, faces e índice de material por face). As gaiolas
viram objetos do Blender em ``kit.py``, onde recebem chanfro (Bevel) e subdivisão (Subsurf),
que multiplicam os polígonos e arredondam as quinas como numa modelagem hard-surface feita à mão.

Convenções: metros, Z para cima, personagem olhando para -Y (o exportador glTF converte para
Y para cima e +Z para a frente, que é a frente dos personagens no Godot).
"""
import numpy as np
from math import pi, tau, sin, cos, atan2

UP = np.array((0.0, 0.0, 1.0))
FRONT = np.array((0.0, -1.0, 0.0))


def unit(a):
    a = np.asarray(a, float)
    n = np.linalg.norm(a, axis=-1, keepdims=True)
    return a / np.maximum(n, 1e-12)


def spow(x, m):
    """Potência com sinal (superelipses)."""
    return np.sign(x) * np.abs(x) ** m


def rot(axis, angle):
    """Matriz de rotação 3x3 (eixo, ângulo em radianos)."""
    k = unit(axis)
    x, y, z = k
    c, s = cos(angle), sin(angle)
    C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def euler(rx=0.0, ry=0.0, rz=0.0):
    """Rotação XYZ em graus (mesma ordem padrão do Blender: R = Rz·Ry·Rx)."""
    return rot((0, 0, 1), np.radians(rz)) @ rot((0, 1, 0), np.radians(ry)) @ rot((1, 0, 0), np.radians(rx))


def basis_from(axis, ref=None):
    """Base ortonormal (X, Y, Z=axis) com X o mais próximo possível de ``ref``."""
    z = unit(axis)
    ref = np.array(FRONT if ref is None else ref, float)
    if abs(np.dot(unit(ref), z)) > 0.98:
        ref = np.array((1.0, 0, 0)) if abs(z[0]) < 0.9 else np.array((0, 0, 1.0))
    x = unit(ref - z * np.dot(ref, z))
    y = np.cross(z, x)
    return x, y, z


class Cage:
    """Malha em construção: vértices, faces (quads/tris/n-gons) e material por face."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.mats = []

    def add(self, pts):
        base = len(self.verts)
        self.verts.extend(tuple(map(float, p)) for p in np.asarray(pts, float).reshape(-1, 3))
        return base

    def face(self, idx, m=0):
        self.faces.append(tuple(int(i) for i in idx))
        self.mats.append(m)

    def grid(self, base, nu, nv, wrap=False, m=0):
        """Quads de uma grade nu x nv (linha a linha); ``wrap`` fecha a direção v."""
        for i in range(nu - 1):
            for j in range(nv if wrap else nv - 1):
                j2 = (j + 1) % nv
                self.face((base + i * nv + j, base + i * nv + j2, base + (i + 1) * nv + j2, base + (i + 1) * nv + j), m)

    def merge(self, other, m_offset=0):
        base = len(self.verts)
        self.verts.extend(other.verts)
        for f, m in zip(other.faces, other.mats):
            self.faces.append(tuple(i + base for i in f))
            self.mats.append(m + m_offset)
        return self

    def apply(self, R=None, t=(0, 0, 0)):
        V = np.asarray(self.verts, float)
        if R is not None:
            V = V @ np.asarray(R, float).T
        V = V + np.asarray(t, float)
        self.verts = [tuple(p) for p in V]
        return self

    def mirrored_x(self):
        """Cópia espelhada em X (lado oposto do corpo); a orientação das faces é recalculada depois."""
        c = Cage()
        c.verts = [(-x, y, z) for (x, y, z) in self.verts]
        c.faces = [tuple(reversed(f)) for f in self.faces]
        c.mats = list(self.mats)
        return c

    def set_mat(self, m):
        self.mats = [m] * len(self.faces)
        return self


def merge(*cages):
    out = Cage()
    for c in cages:
        if c is not None:
            out.merge(c)
    return out


# ------------------------------------------------------------------ curvas

def catmull(points, per_seg=8, closed=False):
    P = np.asarray(points, float)
    n = len(P)
    if n < 2:
        return P.copy()
    if n == 2:
        t = np.linspace(0, 1, per_seg + 1)[:, None]
        return P[0] * (1 - t) + P[1] * t
    out = []
    segs = n if closed else n - 1
    for i in range(segs):
        p1, p2 = P[i], P[(i + 1) % n]
        p0 = P[i - 1] if (i > 0 or closed) else 2 * P[0] - P[1]
        p3 = P[(i + 2) % n] if (i + 2 < n or closed) else 2 * P[-1] - P[-2]
        for s in range(per_seg):
            t = s / per_seg
            t2, t3 = t * t, t * t * t
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-1])
    return np.array(out)


def arclen(P):
    P = np.asarray(P, float)
    return np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]


def resample(P, n):
    P = np.asarray(P, float)
    d = arclen(P)
    s = np.linspace(0.0, d[-1], n)
    return np.stack([np.interp(s, d, P[:, k]) for k in range(3)], axis=1)


def frames(P, ref=FRONT):
    """Referenciais por transporte paralelo: T (tangente), N (perto de ``ref``) e B = T x N."""
    P = np.asarray(P, float)
    n = len(P)
    T = np.zeros_like(P)
    if n > 2:
        T[1:-1] = P[2:] - P[:-2]
    T[0] = P[1] - P[0]
    T[-1] = P[-1] - P[-2]
    T = unit(T)
    ref = np.asarray(ref, float)
    if abs(np.dot(unit(ref), T[0])) > 0.98:
        ref = np.array((0, 0, 1.0)) if abs(T[0][2]) < 0.9 else np.array((1.0, 0, 0))
    N = np.zeros_like(P)
    N[0] = unit(ref - T[0] * np.dot(ref, T[0]))
    for i in range(1, n):
        b = np.cross(T[i - 1], T[i])
        s = np.linalg.norm(b)
        if s < 1e-9:
            N[i] = N[i - 1]
        else:
            N[i] = rot(b / s, atan2(s, np.dot(T[i - 1], T[i]))) @ N[i - 1]
        N[i] = unit(N[i] - T[i] * np.dot(N[i], T[i]))
    B = np.cross(T, N)
    return T, N, B


def _param(values, s_ctrl, s):
    """Valor escalar ou lista por ponto de controle, interpolado ao longo do parâmetro s."""
    if np.isscalar(values):
        return np.full_like(s, float(values))
    return np.interp(s, s_ctrl, np.asarray(values, float))


# ------------------------------------------------------------------ perfis 2D

def superellipse(n, a, b, p=2.0, phase=0.0):
    th = np.linspace(0, tau, n, endpoint=False) + phase
    m = 2.0 / p
    return np.stack([a * spow(np.cos(th), m), b * spow(np.sin(th), m)], 1)


def circle(n, r):
    return superellipse(n, r, r, 2.0)


# ------------------------------------------------------------------ superfícies paramétricas (para placas)

class Surface:
    """Superfície paramétrica P(u, v); as normais saem por diferenças finitas e apontam para fora."""

    def eval(self, u, v):
        raise NotImplementedError

    def center(self, u):
        raise NotImplementedError

    def grid(self, us, V):
        us = np.asarray(us, float)
        V = np.asarray(V, float)
        return self.grid2(np.broadcast_to(us[:, None], V.shape), V)

    def grid2(self, U, V):
        U = np.asarray(U, float)
        V = np.asarray(V, float)
        P = self.eval(U, V)
        e = 1e-4
        Pu = self.eval(U + e, V) - self.eval(U - e, V)
        Pv = self.eval(U, V + e) - self.eval(U, V - e)
        N = np.cross(Pu, Pv)
        bad = np.linalg.norm(N, axis=-1) < 1e-12
        C = self.center(U)
        out = P - C
        N = np.where(bad[..., None], out, N)
        N = unit(N)
        flip = np.sum(N * out, axis=-1) < 0
        N[flip] *= -1
        return P, N


class LoftSurf(Surface):
    """Corpo de seção superelíptica ao longo de um caminho: u ao longo (0..1), v em volta (0..1).

    v = 0 aponta para ``ref`` (por padrão a frente, -Y), v = 0.25 para T x ref.
    a, b, p, offN, offB podem ser listas (um valor por ponto de controle).
    """

    def __init__(self, path, a, b, p=2.0, ref=FRONT, offN=0.0, offB=0.0, dense=240):
        ctrl = np.asarray(path, float)
        P = resample(catmull(ctrl, 16), dense)
        self.T, self.N, self.B = frames(P, ref)
        self.P = P
        d = arclen(ctrl)
        s_ctrl = d / max(d[-1], 1e-9)
        s = np.linspace(0, 1, dense)
        self.a = _param(a, s_ctrl, s)
        self.b = _param(b, s_ctrl, s)
        self.p = _param(p, s_ctrl, s)
        self.oN = _param(offN, s_ctrl, s)
        self.oB = _param(offB, s_ctrl, s)
        self.dense = dense

    def _lerp(self, arr, u):
        x = np.clip(u, 0, 1) * (self.dense - 1)
        i = np.clip(np.floor(x).astype(int), 0, self.dense - 2)
        f = (x - i)
        if arr.ndim == 2:
            return arr[i] * (1 - f)[..., None] + arr[i + 1] * f[..., None]
        return arr[i] * (1 - f) + arr[i + 1] * f

    def eval(self, u, v):
        u = np.asarray(u, float)
        v = np.asarray(v, float)
        P = self._lerp(self.P, u)
        N = self._lerp(self.N, u)
        B = self._lerp(self.B, u)
        a, b, p = self._lerp(self.a, u), self._lerp(self.b, u), self._lerp(self.p, u)
        th = tau * v
        m = 2.0 / p
        x = a * spow(np.cos(th), m) + self._lerp(self.oN, u)
        y = b * spow(np.sin(th), m) + self._lerp(self.oB, u)
        return P + x[..., None] * N + y[..., None] * B

    def center(self, u):
        u = np.asarray(u, float)
        return self._lerp(self.P, u) + self._lerp(self.oN, u)[..., None] * self._lerp(self.N, u) + self._lerp(self.oB, u)[..., None] * self._lerp(self.B, u)

    def tube(self, nu=24, nv=24, caps=True, m=0, u0=0.0, u1=1.0):
        us = np.linspace(u0, u1, nu)
        V = np.broadcast_to(np.linspace(0, 1, nv, endpoint=False)[None, :], (nu, nv))
        P = self.eval(np.broadcast_to(us[:, None], (nu, nv)), V)
        return tube([P[i] for i in range(nu)], caps, caps, m)

    def frame_at(self, u):
        """(posição no eixo, T, N, B) num ponto do caminho."""
        return self._lerp(self.P, u), unit(self._lerp(self.T, u)), unit(self._lerp(self.N, u)), unit(self._lerp(self.B, u))

    def u_at(self, z, axis=2):
        """Parâmetro u onde o eixo do corpo passa pela coordenada ``z`` (caminhos monotônicos)."""
        s = np.linspace(0, 1, self.dense)
        c = self.P[:, axis]
        if c[-1] < c[0]:
            return np.interp(z, c[::-1], s[::-1])
        return np.interp(z, c, s)


class EllipsoidSurf(Surface):
    """Elipsoide (ou superelipsoide): u = azimute (0 = frente -Y, 0.25 = +X), v = elevação (0 = base, 1 = topo)."""

    def __init__(self, c, r, p=(2.0, 2.0), R=None):
        self.c = np.asarray(c, float)
        self.r = np.asarray(r, float)
        self.p = p
        self.R = np.eye(3) if R is None else np.asarray(R, float)

    def eval(self, u, v):
        th = tau * np.asarray(u, float)
        ph = pi * (np.asarray(v, float) - 0.5)
        m1, m2 = 2.0 / self.p[0], 2.0 / self.p[1]
        cph, sph = spow(np.cos(ph), m1), spow(np.sin(ph), m1)
        cth, sth = spow(np.cos(th), m2), spow(np.sin(th), m2)
        L = np.stack([self.r[0] * cph * sth, -self.r[1] * cph * cth, self.r[2] * sph], -1)
        return self.c + L @ self.R.T

    def center(self, u):
        return np.broadcast_to(self.c, np.shape(u) + (3,))


# ------------------------------------------------------------------ construtores de malha

def tube(rings, cap0=True, cap1=True, m=0, mcap=None, wrap=True, m_fn=None):
    """Liga anéis de mesmo número de vértices; tampas como n-gons.

    ``m_fn(s)`` (s = 0..1 ao longo dos anéis) escolhe o material por faixa (ex.: ponta incandescente).
    """
    c = Cage()
    nu, nv = len(rings), len(rings[0])
    base = c.add(np.concatenate([np.asarray(r, float) for r in rings]))
    c.grid(base, nu, nv, wrap, m)
    if m_fn is not None:
        per = nv if wrap else nv - 1
        for k in range(len(c.mats)):
            c.mats[k] = m_fn((k // per + 0.5) / max(1, nu - 1))
    mc = m if mcap is None else mcap
    if cap0:
        c.face([base + j for j in reversed(range(nv))], mc)
    if cap1:
        c.face([base + (nu - 1) * nv + j for j in range(nv)], mc)
    return c


def plate(surf, u0=0.0, u1=1.0, v0=0.0, v1=1.0, nu=8, nv=8, off=0.0, thick=0.02, m=0, m_in=None, wrap=False,
          thick_fn=None, uvfn=None):
    """Placa de armadura com espessura, colada numa superfície paramétrica.

    v0/v1 podem ser funções de u (contornos afunilados, pontas). ``uvfn(UN, VN) -> (U, V)`` mapeia o
    quadrado unitário para qualquer contorno (bordas inclinadas, recortes em V). ``thick_fn(UN, VN)``
    modula a espessura (quilhas, bordas mais finas). Com ``wrap`` a placa fecha em anel (braçadeiras).
    """
    UN, VN = np.meshgrid(np.linspace(0, 1, nu), np.linspace(0, 1, nv, endpoint=not wrap), indexing='ij')
    if uvfn is not None:
        U, V = uvfn(UN, VN)
        U = np.broadcast_to(np.asarray(U, float), UN.shape)
        V = np.broadcast_to(np.asarray(V, float), UN.shape)
    else:
        us = np.linspace(u0, u1, nu)
        a0 = np.array([v0(u) if callable(v0) else v0 for u in us], float)
        a1 = np.array([v1(u) if callable(v1) else v1 for u in us], float)
        U = np.broadcast_to(us[:, None], UN.shape)
        V = a0[:, None] + (a1 - a0)[:, None] * VN
    P, N = surf.grid2(U, V)
    th = np.full(P.shape[:2], float(thick))
    if thick_fn is not None:
        th = th * thick_fn(UN, VN)
    bottom = P + N * off
    top = P + N * (off + th)[..., None]
    c = Cage()
    bt = c.add(top.reshape(-1, 3))
    bb = c.add(bottom.reshape(-1, 3))
    mi = m if m_in is None else m_in
    c.grid(bt, nu, nv, wrap, m)
    c.grid(bb, nu, nv, wrap, mi)

    def wall(loop):
        L = len(loop)
        for k in range(L - 1):
            i0, j0 = loop[k]
            i1, j1 = loop[k + 1]
            c.face((bt + i0 * nv + j0, bt + i1 * nv + j1, bb + i1 * nv + j1, bb + i0 * nv + j0), m)

    if wrap:
        wall([(0, j) for j in range(nv)] + [(0, 0)])
        wall([(nu - 1, j) for j in range(nv)] + [(nu - 1, 0)])
    else:
        loop = [(0, j) for j in range(nv)] + [(i, nv - 1) for i in range(1, nu)] + \
               [(nu - 1, j) for j in range(nv - 2, -1, -1)] + [(i, 0) for i in range(nu - 2, -1, -1)]
        wall(loop)
    return c


def ellipsoid(c, r, p=(2.0, 2.0), R=None, nu=32, nv=16, m=0):
    """Elipsoide/superelipsoide fechado (com polos)."""
    S = EllipsoidSurf(c, r, p, R)
    vs = np.linspace(0, 1, nv + 1)[1:-1]
    us = np.linspace(0, 1, nu, endpoint=False)
    rings = [S.eval(us, np.full_like(us, v)) for v in vs]
    cg = tube(rings, False, False, m)
    bot = cg.add([S.eval(0.0, 0.0)])
    top = cg.add([S.eval(0.0, 1.0)])
    last = (len(vs) - 1) * nu
    for j in range(nu):
        j2 = (j + 1) % nu
        cg.face((bot, j2, j), m)
        cg.face((top, last + j, last + j2), m)
    return cg


def lathe(profile, n=24, origin=(0, 0, 0), axis=(0, 0, 1), ref=None, caps=True, m=0, mcap=None):
    """Sólido de revolução: ``profile`` = [(raio, altura), ...] ao longo de ``axis``."""
    x, y, z = basis_from(axis, ref)
    o = np.asarray(origin, float)
    th = np.linspace(0, tau, n, endpoint=False)
    ring_dir = np.cos(th)[:, None] * x + np.sin(th)[:, None] * y
    rings = [o + z * h + ring_dir * r for (r, h) in profile]
    return tube(rings, caps, caps, m, mcap)


def cyl(p0, p1, r, n=16, caps=True, m=0, r1=None, ref=None):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    L = np.linalg.norm(p1 - p0)
    return lathe([(r, 0.0), (r if r1 is None else r1, L)], n, p0, p1 - p0, ref, caps, m)


def box(center, size, R=None, m=0):
    hx, hy, hz = np.asarray(size, float) / 2
    P = np.array([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
                  [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]])
    if R is not None:
        P = P @ np.asarray(R, float).T
    P = P + np.asarray(center, float)
    c = Cage()
    b = c.add(P)
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        c.face([b + i for i in f], m)
    return c


def extrude(poly, depth, origin=(0, 0, 0), X=(1, 0, 0), Y=(0, 0, 1), m=0, mcap=None):
    """Polígono 2D (no plano X,Y dado) extrudado simetricamente ao longo de X x Y."""
    X, Y = unit(X), unit(Y)
    Z = unit(np.cross(X, Y))
    o = np.asarray(origin, float)
    poly = np.asarray(poly, float)
    ring = o + poly[:, :1] * X + poly[:, 1:2] * Y
    return tube([ring - Z * depth / 2, ring + Z * depth / 2], True, True, m, mcap)


def sweep(ctrl, prof, samples=24, ref=UP, scale=None, twist=0.0, caps=(True, True), smooth=True, m=0, mcap=None, m_fn=None):
    """Perfil 2D (n,2) varrido ao longo de uma curva. ``scale(s)`` -> (sx, sy) ou escalar, s em 0..1."""
    P = catmull(ctrl, 10) if smooth else np.asarray(ctrl, float)
    P = resample(P, samples)
    T, N, B = frames(P, ref)
    prof = np.asarray(prof, float)
    rings = []
    for i in range(samples):
        s = i / (samples - 1)
        pr = prof
        if scale is not None:
            k = scale(s)
            k = (k, k) if np.isscalar(k) else k
            pr = pr * np.asarray(k, float)
        if twist:
            a = twist * s
            pr = pr @ np.array([[cos(a), sin(a)], [-sin(a), cos(a)]])
        rings.append(P[i] + pr[:, :1] * N[i] + pr[:, 1:2] * B[i])
    return tube(rings, caps[0], caps[1], m, mcap, m_fn=m_fn)


def helix_path(origin, axis, R, length, turns, samples=None, ref=None, phase=0.0):
    x, y, z = basis_from(axis, ref)
    samples = samples or int(turns * 24) + 2
    t = np.linspace(0, 1, samples)
    a = t * turns * tau + phase
    return np.asarray(origin, float) + np.outer(np.cos(a) * R, x) + np.outer(np.sin(a) * R, y) + np.outer(t * length, z)


def spring(p0, p1, R, wire, turns, m=0, sides=8):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    path = helix_path(p0, p1 - p0, R, np.linalg.norm(p1 - p0), turns)
    return sweep(path, circle(sides, wire), samples=len(path), smooth=False, ref=p1 - p0, m=m)


def cable(points, r, sides=10, samples=None, ribs=0, m=0, ref=UP):
    """Cabo/mangueira; ``ribs`` > 0 faz uma mangueira sanfonada (mais polígonos, mais mecânica)."""
    pts = catmull(points, 12)
    L = arclen(pts)[-1]
    samples = samples or max(8, int(L / (r * 0.6)) + 2)
    if ribs:
        samples = max(samples, int(ribs * 6))
        scale = lambda s: 1.0 + 0.16 * np.cos(tau * ribs * s) ** 8
    else:
        scale = None
    return sweep(pts, circle(sides, r), samples=samples, ref=ref, scale=scale, m=m, smooth=False)


def bolt(center, normal, r=0.008, h=0.006, sides=6, m=0):
    """Cabeça de parafuso sextavada com chanfro (geometria final, sem subdivisão)."""
    x, y, z = basis_from(normal)
    o = np.asarray(center, float)
    th = np.linspace(0, tau, sides, endpoint=False) + pi / sides
    d = np.cos(th)[:, None] * x + np.sin(th)[:, None] * y
    rings = [o + d * r - z * h * 0.3, o + d * r + z * h * 0.65, o + d * r * 0.72 + z * h]
    return tube(rings, True, True, m)


def bolts_on(surf, uv_list, off=0.0, r=0.008, h=0.006, m=0, sides=6):
    out = Cage()
    for (u, v) in uv_list:
        P, N = surf.grid(np.array([u]), np.array([[v]]))
        out.merge(bolt(P[0, 0] + N[0, 0] * off, N[0, 0], r, h, sides, m))
    return out


def blade(root, tip, chord0, chord1, thick, pitch, axis, nseg=5, m=0, sweep_back=0.0):
    """Pá de turbina/hélice: placa fina afunilada, torcida pelo ângulo ``pitch`` em torno do raio."""
    root, tip = np.asarray(root, float), np.asarray(tip, float)
    radial = unit(tip - root)
    ax = unit(axis)
    tang = unit(np.cross(ax, radial))
    rings = []
    for i in range(nseg):
        s = i / (nseg - 1)
        c = chord0 + (chord1 - chord0) * s
        p = root + (tip - root) * s + tang * sweep_back * s * s
        a = pitch * (1.0 - 0.35 * s)
        R = rot(radial, a)
        t2, a2 = R @ tang, R @ ax
        rings.append(np.array([p - t2 * c / 2 - a2 * thick / 2, p + t2 * c / 2 - a2 * thick / 2,
                               p + t2 * c / 2 + a2 * thick / 2, p - t2 * c / 2 + a2 * thick / 2]))
    return tube(rings, True, True, m)


def fan(center, axis, r_hub, r_tip, blades=9, chord=None, thick=0.006, pitch=0.6, m_hub=0, m_blade=0, ref=None, sweep_back=0.0):
    """Turbina: cubo com nariz e ``blades`` pás torcidas."""
    x, y, z = basis_from(axis, ref)
    o = np.asarray(center, float)
    k = max(r_hub, 0.008) / 0.04
    c = lathe([(0.0, -0.02 * k), (r_hub * 0.7, -0.02 * k), (r_hub, 0.0), (r_hub, 0.03 * k), (r_hub * 0.55, 0.05 * k), (0.0, 0.058 * k)],
              24, o + z * -0.015 * k, z, ref, True, m_hub)
    chord = chord or (r_tip - r_hub) * 0.55
    for k in range(blades):
        a = tau * k / blades
        d = cos(a) * x + sin(a) * y
        c.merge(blade(o + d * r_hub * 0.92, o + d * r_tip, chord * 1.1, chord * 0.75, thick, pitch, z, 5, m_blade, sweep_back))
    return c


def gear(center, axis, r, teeth, depth, tooth=0.012, hole=0.0, m=0, ref=None):
    """Engrenagem plana com dentes trapezoidais (furo central opcional como anel)."""
    pts = []
    for k in range(teeth):
        a0 = tau * k / teeth
        da = tau / teeth
        for f, rr in ((0.0, r), (0.18, r + tooth), (0.42, r + tooth), (0.6, r)):
            a = a0 + f * da
            pts.append((cos(a) * rr, sin(a) * rr))
    x, y, z = basis_from(axis, ref)
    c = extrude(pts, depth, center, x, y, m)
    return c


def ring_band(center, axis, r_in, r_out, depth, n=48, m=0, ref=None):
    """Anel chato (arruela grande, aro de turbina)."""
    prof = [(r_in, -depth / 2), (r_out, -depth / 2), (r_out, depth / 2), (r_in, depth / 2)]
    x, y, z = basis_from(axis, ref)
    o = np.asarray(center, float)
    th = np.linspace(0, tau, n, endpoint=False)
    d = np.cos(th)[:, None] * x + np.sin(th)[:, None] * y
    rings = [o + z * h + d * r for (r, h) in prof]
    c = Cage()
    nv = n
    base = c.add(np.concatenate(rings + [rings[0]]))
    c.grid(base, len(rings) + 1, nv, True, m)
    return c


def torus(center, axis, R, r, nu=48, nv=12, m=0, ref=None):
    x, y, z = basis_from(axis, ref)
    o = np.asarray(center, float)
    rings = []
    for i in range(nu):
        a = tau * i / nu
        d = cos(a) * x + sin(a) * y
        b = np.linspace(0, tau, nv, endpoint=False)
        rings.append(o + d * R + np.outer(np.cos(b) * r, d) + np.outer(np.sin(b) * r, z))
    c = Cage()
    base = c.add(np.concatenate(rings + [rings[0]]))
    c.grid(base, nu + 1, nv, True, m)
    return c


def vent(center, R, w, h, slats=5, depth=0.03, frame=0.008, angle=35.0, m_frame=0, m_slat=0, m_glow=None):
    """Grade de ventilação: moldura + aletas inclinadas (+ fundo brilhante opcional)."""
    R = np.eye(3) if R is None else np.asarray(R, float)
    o = np.asarray(center, float)
    X, Y, Z = R[:, 0], R[:, 1], R[:, 2]   # X largura, Z altura, Y profundidade (para fora = -Y)
    c = Cage()
    for sx in (-1, 1):
        c.merge(box(o + X * sx * (w / 2 - frame / 2), (frame, depth, h), R, m_frame))
    for sz in (-1, 1):
        c.merge(box(o + Z * sz * (h / 2 - frame / 2), (w - 2 * frame, depth, frame), R, m_frame))
    inner_h = h - 2 * frame
    for k in range(slats):
        zc = -inner_h / 2 + inner_h * (k + 0.5) / slats
        Rs = R @ rot((1, 0, 0), np.radians(angle))
        c.merge(box(o + Z * zc, (w - 2 * frame, inner_h / slats * 1.05, 0.004), Rs, m_slat))
    if m_glow is not None:
        c.merge(box(o + Y * depth * 0.45, (w - 2 * frame, 0.004, inner_h), R, m_glow))
    return c


def piston(p0, p1, r, m_sleeve=0, m_rod=0, m_cap=0, n=16, sleeve_frac=0.55, ref=None):
    """Pistão hidráulico: camisa grossa, haste polida, olhais com pino nas duas pontas."""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = p1 - p0
    L = np.linalg.norm(d)
    ax = d / L
    c = Cage()
    ls = L * sleeve_frac
    c.merge(lathe([(r * 0.6, 0.0), (r * 0.95, r * 0.4), (r, r * 0.8), (r, ls - r * 0.6), (r * 1.12, ls - r * 0.5),
                   (r * 1.12, ls - r * 0.1), (r * 0.7, ls)], n, p0, ax, ref, True, m_sleeve))
    c.merge(cyl(p0 + ax * (ls - r * 0.2), p1 - ax * r * 0.4, r * 0.42, n, True, m_rod, ref=ref))
    x, y, z = basis_from(ax, ref)
    for p, s in ((p0, -1), (p1, 1)):
        c.merge(cyl(p - y * r * 0.9, p + y * r * 0.9, r * 0.75, 14, True, m_cap, ref=ax))
        c.merge(cyl(p - y * r * 1.15, p + y * r * 1.15, r * 0.3, 10, True, m_rod, ref=ax))
    return c


def jagged(p0, p1, segs=10, amp=0.05, seed=0):
    """Polilinha fractal (raio/arco de energia)."""
    rng = np.random.default_rng(seed)
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    pts = [p0, p1]
    a = amp
    while len(pts) < segs:
        new = [pts[0]]
        for i in range(len(pts) - 1):
            mid = (pts[i] + pts[i + 1]) / 2 + rng.normal(0, a, 3)
            new += [mid, pts[i + 1]]
        pts = new
        a *= 0.55
    return np.array(pts)
