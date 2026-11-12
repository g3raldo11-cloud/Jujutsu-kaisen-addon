"""Vegetação e chão para os renders realistas (Cycles): folhas secas curvadas no chão, samambaias com
folíolos de verdade, gravetos, capim do cerrado, copa que recorta a luz da lua (fachos na névoa)
e troncos distantes. Tudo é gerado com numpy em lote (dezenas de milhares de peças em segundos)."""
import bpy
import numpy as np
from math import tau, pi

from . import kit, geo


# ====================================================================== geometria em lote
def _rot_batch(yaw, pitch, roll):
    """Matrizes de rotação (n,3,3) R = Rz(yaw)·Rx(pitch)·Ry(roll)."""
    cy, sy = np.cos(yaw), np.sin(yaw)
    cp, sp = np.cos(pitch), np.sin(pitch)
    cr, sr = np.cos(roll), np.sin(roll)
    n = len(yaw)
    Rz = np.zeros((n, 3, 3))
    Rz[:, 0, 0], Rz[:, 0, 1], Rz[:, 1, 0], Rz[:, 1, 1], Rz[:, 2, 2] = cy, -sy, sy, cy, 1
    Rx = np.zeros((n, 3, 3))
    Rx[:, 0, 0], Rx[:, 1, 1], Rx[:, 1, 2], Rx[:, 2, 1], Rx[:, 2, 2] = 1, cp, -sp, sp, cp
    Ry = np.zeros((n, 3, 3))
    Ry[:, 0, 0], Ry[:, 0, 2], Ry[:, 1, 1], Ry[:, 2, 0], Ry[:, 2, 2] = cr, sr, 1, -sr, cr
    return Rz @ Rx @ Ry


def _grid_faces(nl, nw, count):
    i, j = np.meshgrid(np.arange(nl - 1), np.arange(nw - 1), indexing='ij')
    q = np.stack([i * nw + j, i * nw + j + 1, (i + 1) * nw + j + 1, (i + 1) * nw + j], -1).reshape(-1, 4)
    off = (np.arange(count) * nl * nw)[:, None, None]
    return (q[None] + off).reshape(-1, 4)


def leaves(n, rng, length=(0.035, 0.08), aspect=(0.28, 0.5), curl=(0.2, 1.6), fold=(0.15, 0.55), nl=8, nw=5,
           wave=0.12, shape=None):
    """Folhas em espaço local: base na origem, comprimento em +Y, face para +Z (antes de orientar).
    Devolve P (n, nl*nw, 3), lt (ao longo), lx (através, 0 = nervura) e o comprimento de cada folha."""
    t = np.linspace(0, 1, nl)
    x = np.linspace(-1, 1, nw)
    T, X = np.meshgrid(t, x, indexing='ij')
    L = rng.uniform(*length, n)[:, None, None]
    W = L * rng.uniform(*aspect, n)[:, None, None]
    sh = rng.uniform(0.55, 0.95, n)[:, None, None] if shape is None else np.full((n, 1, 1), shape)
    prof = np.maximum(np.sin(pi * np.clip(T[None], 0, 1) ** sh), 0.03)              # ovalada / lanceolada
    px = X[None] * W * prof
    fl = rng.uniform(*fold, n)[:, None, None]
    pz = np.abs(X[None]) * W * prof * fl                                             # dobra na nervura
    pz += W * wave * np.sin(T[None] * rng.uniform(8, 16, n)[:, None, None] + X[None] * 3) * np.abs(X[None])  # borda ondulada
    c = rng.uniform(*curl, n)[:, None, None] * rng.choice([-1, 1], n)[:, None, None]
    ang = c * T[None]
    safe = np.where(np.abs(c) < 1e-3, 1e-3, c)
    py = np.sin(ang) / safe * L
    pz = pz + (1 - np.cos(ang)) / safe * L                                           # enrola ao secar
    # torção lateral (folha seca empena)
    tw = rng.normal(0, 0.5, n)[:, None, None] * T[None]
    px2 = px * np.cos(tw) - pz * np.sin(tw)
    pz2 = px * np.sin(tw) + pz * np.cos(tw)
    P = np.stack([px2, py, pz2], -1).reshape(n, nl * nw, 3)
    lt = np.broadcast_to(T[None], (n, nl, nw)).reshape(n, -1)
    lx = np.broadcast_to(np.abs(X)[None], (n, nl, nw)).reshape(n, -1)
    return P, lt, lx, L[:, 0, 0]


def ground_height(xy, ground_r=40.0, rise=0.8):
    r = np.linalg.norm(xy, axis=-1)
    return (r / ground_r) ** 2 * rise


def litter(name, mat, rng, count=7000, center=(0, 0), radius=4.5, avoid=None, ground_r=40.0, rise=0.8, col=None,
           length=(0.035, 0.085)):
    """Folhiço: milhares de folhas secas caídas (curvadas, dobradas, de vários tons), mais densas
    perto do centro. ``avoid``: lista de (x, y, raio) onde não cair (pés do personagem)."""
    nl, nw = 8, 5
    P, lt, lx, L = leaves(count, rng, length=length)
    r = radius * np.sqrt(rng.uniform(0, 1, count)) ** 1.15
    a = rng.uniform(0, tau, count)
    xy = np.stack([np.cos(a) * r + center[0], np.sin(a) * r + center[1]], 1)
    keep = np.ones(count, bool)
    for (ax, ay, ar) in (avoid or []):
        keep &= np.hypot(xy[:, 0] - ax, xy[:, 1] - ay) > ar
    P, lt, lx, L, xy = P[keep], lt[keep], lx[keep], L[keep], xy[keep]
    n = len(P)
    R = _rot_batch(rng.uniform(0, tau, n), rng.normal(0, 0.25, n), rng.normal(0, 0.25, n))
    z = ground_height(xy, ground_r, rise) + 0.004 + np.arange(n) / n * 0.012          # empilhadas
    Pw = np.einsum('nij,nvj->nvi', R, P) + np.concatenate([xy, z[:, None]], 1)[:, None, :]
    F = _grid_faces(nl, nw, n)
    cor = np.repeat(rng.uniform(0, 1, n), nl * nw)
    me = kit.fast_mesh(name, Pw.reshape(-1, 3), F, {'cor': cor, 'lt': lt.ravel(), 'lx': lx.ravel()})
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    (col or kit.collection('Mata')).objects.link(ob)
    return ob


def fern(name, mat, rng, clumps, fronds=(6, 10), length=(0.6, 1.15), col=None, pairs=26):
    """Samambaias: cada fronde tem raque arqueada e pares de folíolos que diminuem até a ponta."""
    allP, allF, allT, allC = [], [], [], []
    base_v = 0
    up = np.array((0, 0, 1.0))
    pl_nl, pl_nw = 5, 3
    for c in clumps:
        c = np.asarray(c, float)
        for f in range(rng.integers(*fronds)):
            fa = rng.uniform(0, tau)
            d = np.array((np.cos(fa), np.sin(fa), 0.0))
            L = rng.uniform(*length)
            rise = rng.uniform(0.45, 0.8)
            S = pairs + 2
            s = np.linspace(0, 1, S)
            # raque: sobe e arqueia, a ponta cai
            arc = (c[None] + d[None] * (L * s)[:, None]
                   + up[None] * (L * (rise * np.sin(np.pi * s * 0.85) - 0.12 * s ** 2))[:, None])
            T = np.gradient(arc, axis=0)
            T /= np.linalg.norm(T, axis=1, keepdims=True)
            side = np.cross(T, up)
            side /= np.linalg.norm(side, axis=1, keepdims=True) + 1e-9
            nrm = np.cross(side, T)
            # raque como fita fina
            w0 = 0.004 * (1 - 0.7 * s)
            rib = np.stack([arc - side * w0[:, None], arc + side * w0[:, None]], 1).reshape(-1, 3)
            Fr = np.array([[2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2] for i in range(S - 1)]) + base_v
            allP.append(rib)
            allF.append(Fr)
            allT.append(np.repeat(s, 2))
            allC.append(np.full(2 * S, rng.uniform()))
            base_v += 2 * S
            # folíolos
            k = np.arange(2, S - 1)
            ks = s[k]
            lp = L * 0.17 * np.sin(np.pi * (0.12 + 0.88 * ks)) ** 0.6 * (1.0 - 0.75 * ks)
            m = len(k) * 2
            P, lt, lx, _ = leaves(m, rng, length=(1.0, 1.0), aspect=(0.22, 0.3), curl=(0.1, 0.5), fold=(0.05, 0.25),
                                  nl=pl_nl, nw=pl_nw, wave=0.05, shape=0.85)
            P = P * np.repeat(lp, 2)[:, None, None]
            sgn = np.tile([1.0, -1.0], len(k))
            kk = np.repeat(k, 2)
            # base local do folíolo: Y = para fora (lado), um pouco para a frente e caindo; Z = normal da fronde
            Y = side[kk] * sgn[:, None] * 0.85 + T[kk] * 0.45 - nrm[kk] * 0.18
            Y /= np.linalg.norm(Y, axis=1, keepdims=True)
            Z = nrm[kk] - (nrm[kk] * Y).sum(1, keepdims=True) * Y
            Z /= np.linalg.norm(Z, axis=1, keepdims=True)
            X = np.cross(Y, Z)
            R = np.stack([X, Y, Z], 2)
            Pw = np.einsum('nij,nvj->nvi', R, P) + arc[kk][:, None, :]
            F = _grid_faces(pl_nl, pl_nw, m) + base_v
            allP.append(Pw.reshape(-1, 3))
            allF.append(F)
            allT.append(np.repeat(ks, 2).repeat(pl_nl * pl_nw))
            allC.append(np.full(m * pl_nl * pl_nw, rng.uniform()))
            base_v += m * pl_nl * pl_nw
    me = kit.fast_mesh(name, np.concatenate(allP), np.concatenate(allF),
                       {'lt': np.concatenate(allT), 'cor': np.concatenate(allC)})
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    (col or kit.collection('Mata')).objects.link(ob)
    return ob


def blades(name, mat, rng, roots, per=(14, 30), height=(0.25, 0.7), width=(0.0025, 0.005), lean=0.45, col=None,
           nseg=6, dry=0.0):
    """Capim: touceiras de folhas finas (fitas que afinam e curvam com o próprio peso)."""
    allP, allT, allC = [], [], []
    for c in roots:
        c = np.asarray(c, float)
        k = rng.integers(*per)
        a = rng.uniform(0, tau, k)
        out = np.stack([np.cos(a), np.sin(a), np.zeros(k)], 1)
        H = rng.uniform(*height, k)
        Wd = rng.uniform(*width, k)
        lk = rng.uniform(0.15, lean, k)
        s = np.linspace(0, 1, nseg)
        # caminho: sobe e curva para fora (arco), ponta cai
        base = c[None] + out * rng.uniform(0.0, 0.03, k)[:, None]
        P = (base[:, None, :] + out[:, None, :] * (H * lk)[:, None, None] * (s ** 1.6)[None, :, None]
             + np.array((0, 0, 1.0))[None, None, :] * H[:, None, None] * (s - 0.35 * lk[:, None] * s ** 2.2)[:, :, None])
        side = np.stack([-np.sin(a), np.cos(a), np.zeros(k)], 1)
        w = Wd[:, None] * (1 - s[None] ** 1.3)
        A = P - side[:, None, :] * w[:, :, None]
        B = P + side[:, None, :] * w[:, :, None]
        V = np.stack([A, B], 2).reshape(k, nseg * 2, 3)
        allP.append(V)
        allT.append(np.broadcast_to(np.repeat(s, 2)[None], (k, nseg * 2)))
        allC.append(np.repeat(rng.uniform(0, 1, k), nseg * 2).reshape(k, -1))
    V = np.concatenate(allP)
    n = len(V)
    F = _grid_faces(nseg, 2, n)
    me = kit.fast_mesh(name, V.reshape(-1, 3), F, {'lt': np.concatenate(allT).ravel(), 'cor': np.concatenate(allC).ravel()})
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    (col or kit.collection('Mata')).objects.link(ob)
    return ob


def saplings(name_wood, name_leaf, wood_mat, leaf_mat, rng, spots, col=None):
    """Arvoretas do sub-bosque: caule fino que se inclina para a luz, galhos e cachos de folhas verdes
    largas (camadas de verde entre a câmera e os troncos, como numa mata de verdade)."""
    cage = geo.Cage()
    leafP, leafT, leafX = [], [], []
    nl, nw = 8, 5
    for c in spots:
        c = np.asarray(c, float)
        H = rng.uniform(1.2, 3.2)
        lean = rng.normal(0, 0.25, 2)
        pts = [c + np.array((lean[0] * H * t * t, lean[1] * H * t * t, H * t)) for t in np.linspace(0, 1, 6)]
        cage.merge(geo.sweep(pts, geo.circle(7, rng.uniform(0.012, 0.025)), 14, scale=lambda s: 1 - 0.6 * s, caps=(True, True)))
        tips = [pts[-1]]
        for b in range(rng.integers(3, 7)):
            j = rng.integers(2, 5)
            ba = rng.uniform(0, tau)
            d = geo.unit((np.cos(ba), np.sin(ba), rng.uniform(0.2, 0.8)))
            L = rng.uniform(0.3, 0.8)
            q = [pts[j], pts[j] + d * L * 0.5 + (0, 0, 0.05), pts[j] + d * L]
            cage.merge(geo.sweep(q, geo.circle(5, 0.006), 8, scale=lambda s: 1 - 0.6 * s, caps=(True, True)))
            tips.append(q[-1])
        for tp in tips:
            k = rng.integers(25, 45)
            P, lt, lx, L = leaves(k, rng, length=(0.09, 0.2), aspect=(0.3, 0.45), curl=(0.1, 0.6), fold=(0.1, 0.3), wave=0.06)
            dirs = geo.unit(rng.normal(0, 1, (k, 3)) + np.array((0, 0, 0.2)))
            yaw = np.arctan2(dirs[:, 1], dirs[:, 0]) - pi / 2
            pitch = np.arcsin(np.clip(dirs[:, 2], -1, 1)) - 0.35
            R = _rot_batch(yaw, pitch, rng.normal(0, 0.4, k))
            off = np.asarray(tp) + rng.normal(0, 0.12, (k, 3)) * np.array((1, 1, 0.6))
            leafP.append(np.einsum('nij,nvj->nvi', R, P) + off[:, None, :])
            leafT.append(lt)
            leafX.append(lx)
    me = kit.cage_to_mesh(cage, name_wood, 60.0)
    me.materials.append(wood_mat)
    ob = bpy.data.objects.new(name_wood, me)
    (col or kit.collection('Mata')).objects.link(ob)
    Pw = np.concatenate(leafP)
    F = _grid_faces(nl, nw, len(Pw))
    cor = np.repeat(rng.uniform(0, 1, len(Pw)), nl * nw)
    me2 = kit.fast_mesh(name_leaf, Pw.reshape(-1, 3), F, {'cor': cor, 'lt': np.concatenate(leafT).ravel(), 'lx': np.concatenate(leafX).ravel()})
    me2.materials.append(leaf_mat)
    ob2 = bpy.data.objects.new(name_leaf, me2)
    (col or kit.collection('Mata')).objects.link(ob2)
    return ob, ob2


def twigs(name, mat, rng, count=260, radius=4.0, avoid=None, col=None):
    """Gravetos e galhinhos caídos."""
    cage = geo.Cage()
    for i in range(count):
        r = radius * np.sqrt(rng.uniform())
        a = rng.uniform(0, tau)
        p = np.array((np.cos(a) * r, np.sin(a) * r, 0.0))
        if avoid and any(np.hypot(p[0] - ax, p[1] - ay) < ar for ax, ay, ar in avoid):
            continue
        p[2] = ground_height(p[None, :2])[0] + 0.004
        d = geo.unit((np.cos(rng.uniform(0, tau)), np.sin(rng.uniform(0, tau)), 0.0))
        L = rng.uniform(0.06, 0.35)
        pts = [p + d * L * t + np.array((rng.normal(0, 0.01), rng.normal(0, 0.01), 0.006 * np.sin(t * 3))) for t in np.linspace(0, 1, 5)]
        cage.merge(geo.sweep(pts, geo.circle(5, rng.uniform(0.002, 0.006)), 8, scale=lambda s: 1 - 0.4 * s, caps=(True, True)))
        if rng.uniform() < 0.4:
            q = pts[2]
            d2 = geo.unit(d + np.cross(d, (0, 0, 1)) * rng.choice([-1, 1]) * 0.8)
            cage.merge(geo.sweep([q, q + d2 * L * 0.2, q + d2 * L * 0.35], geo.circle(4, 0.0018), 5, caps=(True, True)))
    me = kit.cage_to_mesh(cage, name, 60.0)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    (col or kit.collection('Mata')).objects.link(ob)
    return ob


def canopy(name, z=9.0, size=70.0, holes=0.55, scale=0.35, seed=0.0, col=None):
    """Copa das árvores fora do quadro: recorta a luz da lua em manchas (chão salpicado de luz e fachos
    na névoa). Invisível para a câmera; só faz sombra."""
    m = bpy.data.materials.new(name + '_mat')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.noise_dimensions = '4D'
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 6.0
    nz.inputs['Roughness'].default_value = 0.62
    nz.inputs['W'].default_value = seed
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    cr = nt.nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].position = holes - 0.04
    cr.color_ramp.elements[1].position = holes + 0.04
    nt.links.new(nz.outputs['Fac'], cr.inputs['Fac'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    df = nt.nodes.new('ShaderNodeBsdfDiffuse')
    df.inputs['Color'].default_value = (0.01, 0.02, 0.01, 1)
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(cr.outputs['Color'], mix.inputs['Fac'])
    nt.links.new(df.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    h = size / 2
    me = kit.fast_mesh(name, np.array([(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)]), np.array([[0, 1, 2, 3]]))
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    (col or kit.collection('Mata')).objects.link(ob)
    ob.location = (0, 0, z)
    for k in ('visible_camera', 'visible_diffuse', 'visible_glossy', 'visible_transmission'):
        if hasattr(ob, k):
            setattr(ob, k, False)
    return ob


# ====================================================================== materiais
def _nodes(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')


def _attr(nt, name):
    a = nt.nodes.new('ShaderNodeAttribute')
    a.attribute_name = name
    return a.outputs['Fac']


def _ramp(nt, fac, stops, constant=False):
    cr = nt.nodes.new('ShaderNodeValToRGB')
    if constant:
        cr.color_ramp.interpolation = 'CONSTANT'
    els = cr.color_ramp.elements
    while len(els) < len(stops):
        els.new(0.5)
    for e, (p, c) in zip(els, stops):
        e.position = p
        e.color = (*c, 1)
    nt.links.new(fac, cr.inputs['Fac'])
    return cr.outputs['Color']


def leaf_material(name, stops, rough=0.6, translucent=0.25, trans_tint=(1.0, 0.85, 0.4), vein=0.35, sheen=0.0):
    """Folha: cor sorteada por folha (atributo 'cor'), nervura central mais escura, verso translúcido
    (a luz atravessa a folha fina, como no contraluz de verdade) e relevo das nervuras."""
    m, nt, out = _nodes(name)
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    base = _ramp(nt, _attr(nt, 'cor'), stops)
    # nervura central e escurecimento na borda
    lx = _attr(nt, 'lx')
    dark = nt.nodes.new('ShaderNodeMath')
    dark.operation = 'POWER'
    nt.links.new(lx, dark.inputs[0])
    dark.inputs[1].default_value = 0.35
    mixv = nt.nodes.new('ShaderNodeMixRGB')
    mixv.blend_type = 'MULTIPLY'
    nt.links.new(base, mixv.inputs['Color1'])
    mixv.inputs['Color2'].default_value = (1 - vein, 1 - vein, 1 - vein, 1)
    inv = nt.nodes.new('ShaderNodeMath')
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    nt.links.new(dark.outputs[0], inv.inputs[1])
    nt.links.new(inv.outputs[0], mixv.inputs['Fac'])
    # manchas de decomposição
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 60.0
    nz.inputs['Detail'].default_value = 4.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mixn = nt.nodes.new('ShaderNodeMixRGB')
    mixn.blend_type = 'MULTIPLY'
    mixn.inputs['Fac'].default_value = 0.45
    nt.links.new(mixv.outputs['Color'], mixn.inputs['Color1'])
    nt.links.new(nz.outputs['Color'], mixn.inputs['Color2'])
    nt.links.new(mixn.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = rough
    if sheen and 'Sheen Weight' in bs.inputs:
        bs.inputs['Sheen Weight'].default_value = sheen
    # relevo: nervuras secundárias (ondas ao longo) + ruído
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.inputs['Scale'].default_value = 90.0
    wv.inputs['Distortion'].default_value = 2.0
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    bump.inputs['Distance'].default_value = 0.0005
    nt.links.new(wv.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
    if translucent > 0:
        tl = nt.nodes.new('ShaderNodeBsdfTranslucent')
        tint = nt.nodes.new('ShaderNodeMixRGB')
        tint.blend_type = 'MULTIPLY'
        tint.inputs['Fac'].default_value = 1.0
        nt.links.new(mixn.outputs['Color'], tint.inputs['Color1'])
        tint.inputs['Color2'].default_value = (*trans_tint, 1)
        nt.links.new(tint.outputs['Color'], tl.inputs['Color'])
        mix = nt.nodes.new('ShaderNodeMixShader')
        mix.inputs['Fac'].default_value = translucent
        nt.links.new(bs.outputs[0], mix.inputs[1])
        nt.links.new(tl.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
    else:
        nt.links.new(bs.outputs[0], out.inputs['Surface'])
    m['gltf_base'] = list(stops[len(stops) // 2][1])
    return m


DRY_LEAVES = [(0.0, (0.2, 0.09, 0.03)), (0.25, (0.33, 0.17, 0.05)), (0.45, (0.12, 0.06, 0.025)),
              (0.65, (0.42, 0.25, 0.08)), (0.8, (0.06, 0.04, 0.025)), (1.0, (0.28, 0.1, 0.04))]
GREEN_LEAVES = [(0.0, (0.03, 0.09, 0.02)), (0.5, (0.05, 0.13, 0.03)), (1.0, (0.09, 0.15, 0.03))]
DRY_GRASS = [(0.0, (0.42, 0.32, 0.13)), (0.35, (0.55, 0.43, 0.2)), (0.7, (0.32, 0.25, 0.1)), (1.0, (0.62, 0.52, 0.28))]


def grass_material(name, stops=None, tip=(0.75, 0.66, 0.42)):
    """Capim seco: cor da touceira sorteada, ponta mais clara e queimada de sol, translúcido."""
    m, nt, out = _nodes(name)
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    base = _ramp(nt, _attr(nt, 'cor'), stops or DRY_GRASS)
    mix = nt.nodes.new('ShaderNodeMixRGB')
    nt.links.new(base, mix.inputs['Color1'])
    mix.inputs['Color2'].default_value = (*tip, 1)
    lt = _attr(nt, 'lt')
    pw = nt.nodes.new('ShaderNodeMath')
    pw.operation = 'POWER'
    nt.links.new(lt, pw.inputs[0])
    pw.inputs[1].default_value = 2.5
    nt.links.new(pw.outputs[0], mix.inputs['Fac'])
    # base da touceira escura (sombra entre as folhas)
    dk = nt.nodes.new('ShaderNodeMixRGB')
    dk.blend_type = 'MULTIPLY'
    nt.links.new(mix.outputs['Color'], dk.inputs['Color1'])
    dk.inputs['Color2'].default_value = (0.25, 0.22, 0.18, 1)
    sm = nt.nodes.new('ShaderNodeMath')
    sm.operation = 'SUBTRACT'
    sm.use_clamp = True
    sm.inputs[0].default_value = 0.6
    nt.links.new(lt, sm.inputs[1])
    nt.links.new(sm.outputs[0], dk.inputs['Fac'])
    nt.links.new(dk.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.55
    tl = nt.nodes.new('ShaderNodeBsdfTranslucent')
    nt.links.new(dk.outputs['Color'], tl.inputs['Color'])
    mx = nt.nodes.new('ShaderNodeMixShader')
    mx.inputs['Fac'].default_value = 0.3
    nt.links.new(bs.outputs[0], mx.inputs[1])
    nt.links.new(tl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    m['gltf_base'] = [0.45, 0.36, 0.16]
    return m
