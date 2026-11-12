"""CURUPIRA — guardião da mata (versão orgânica, esculpida).

Corpo atlético esculpido (massas musculares + vincos), pele escura com placas queimadas e
rachaduras de brasa que brilham, olhos de fogo, orelhas pontudas, cabeleira de mechas em chamas,
PÉS VIRADOS PARA TRÁS (calcanhar na frente), saia de fibras com cinto de corda trançada, colar
de dentes e sementes, amarrações nos pulsos e tornozelos e uma lança de pedra lascada com penas.
"""
import bpy
import numpy as np
from math import tau, pi, cos, sin, radians
from mathutils import Matrix, Vector

from . import geo, kit, sculpt, anatomy, org, rig as rigmod
from .humano import Hero, skin_regions, section, transfer_nearest, anchors, rot_world, bone_world, clay, skeleton as human_bones

ID = 'curupira'
HERO_COLOR = (1.0, 0.42, 0.08)
HEIGHT = 2.2
F = np.array((0.0, -1.0, 0.0))
UP = np.array((0.0, 0.0, 1.0))


def ember_mask(V, lm, seed=0):
    """Placas de pele queimada (assimétricas, como manchas de carvão em brasa)."""
    blobs = [(lm['ombro_r'] + np.array((0.02, 0.01, -0.06)), 0.11), (lm['cotovelo_r'] * 0.35 + lm['ombro_r'] * 0.65, 0.07),
             (lm['cotovelo_l'] * 0.5 + lm['pulso_l'] * 0.5, 0.09), (lm['pulso_r'] + (lm['cotovelo_r'] - lm['pulso_r']) * 0.25, 0.06),
             (lm['quadril_l'] * 0.45 + lm['joelho_l'] * 0.55 + np.array((-0.04, 0, 0)), 0.11),
             (lm['joelho_r'] * 0.6 + lm['tornozelo_r'] * 0.4 + np.array((0.0, 0.03, 0)), 0.09),
             (np.array((0.08, 0.1, 1.36)), 0.1), (np.array((-0.1, -0.1, 1.43)), 0.05), (np.array((0.05, -0.06, 1.66)), 0.035)]
    m = np.zeros(len(V))
    for c, r in blobs:
        m += np.exp(-(np.linalg.norm(V - c, axis=1) / r) ** 2)
    rng = np.random.default_rng(seed)
    G = 16
    grid = rng.uniform(0, 1, (G, G, G))
    idx = np.floor((V * 9.0) % G).astype(int)
    nz = grid[idx[:, 0], idx[:, 1], idx[:, 2]]
    return np.clip((m * 1.4 - 0.35) * (0.6 + 0.8 * nz), 0, 1)


def flame_lock(root, d, L, w, rng):
    root = np.asarray(root, float)
    d = geo.unit(d)
    side = geo.unit(np.cross(d, (0, 1, 0)) + 1e-4)
    back = np.array((0, 1.0, 0))
    ctrl = [root]
    ph = rng.uniform(0, 6)
    for k in range(1, 6):
        t = k / 5
        ctrl.append(root + d * L * t + side * w * 1.6 * np.sin(t * 4.5 + ph) * t + back * L * 0.35 * t * t)
    prof = geo.superellipse(8, w, w * 0.32, 2.2)
    n = 16
    cg = geo.sweep(ctrl, prof, n, ref=side, twist=rng.uniform(-0.8, 0.8),
                   scale=lambda s: (1 - s) ** 0.85 * (0.7 + 0.3 * np.sin(min(1.0, s * 3) * pi / 2)), caps=(True, True))
    sv = [min(1.0, (i // 8) / (n - 1)) for i in range(len(cg.verts))]
    return cg, sv


def build(detail=2, voxel=0.0024):
    col = kit.collection(ID)
    body = anatomy.Body('curupira_corpo', 1.85, build=1.08, feet_backward=True, ears_pointed=1.0, gaunt=1.0)
    lm = body.lm
    ob = sculpt.build_body(body, voxel, col=col)
    V = sculpt.verts(ob)
    # ---------------- pele queimada com rachaduras em brasa
    mask = ember_mask(V, lm)
    k1 = sculpt.cracks(ob, mask, seeds=700, width=0.0048, depth=0.0018, seed=3, plate=0.0008, broken=0.3)
    k2 = sculpt.cracks(ob, np.clip(mask * 1.6 - 0.6, 0, 1), seeds=2400, width=0.0026, depth=0.0009, seed=4, plate=0.0003, broken=0.45)
    k = np.maximum(k1, k2 * 0.75)
    sculpt.noise_displace(ob, 0.0009, 70.0, seed=2, mask=mask)
    sculpt.noise_displace(ob, 0.00035, 300.0, seed=5)
    sculpt.set_attr(ob, 'brasa', k)
    sculpt.set_attr(ob, 'cinza', np.clip(mask * 0.9, 0, 1))
    skin_regions(ob, lm, body.k)
    M = {
        'pele': org.skin('cur_pele', (0.045, 0.026, 0.018), (1.0, 0.3, 0.035), 8.0),
        'olho': org.glow('cur_olho', (1.0, 0.55, 0.1), 9.0),
        'cabelo': org.flame_strands('cur_cabelo', 2.6),
        'palha': org.fiber('cur_palha', (0.42, 0.34, 0.17), (0.22, 0.16, 0.07)),
        'corda': org.fiber('cur_corda', (0.2, 0.13, 0.06), (0.1, 0.06, 0.03), 0.8),
        'dente': org.solid('cur_dente', (0.75, 0.68, 0.55), 0.35, 0.0, 60.0, 0.15, coat=0.3, sss=0.2),
        'semente': org.solid('cur_semente', (0.25, 0.02, 0.015), 0.25, 0.0, coat=0.8),
        'madeira': org.wood('cur_madeira', (0.17, 0.09, 0.04)),
        'pedra': org.solid('cur_pedra', (0.012, 0.012, 0.014), 0.12, 0.1, 80.0, 0.3, coat=0.7),
        'pena_vermelha': org.solid('cur_pena_vermelha', (0.55, 0.03, 0.02), 0.5, 0.0, 300.0, 0.2, sss=0.2),
        'pena_azul': org.solid('cur_pena_azul', (0.02, 0.12, 0.45), 0.45, 0.0, 300.0, 0.2, sss=0.2),
    }
    ob.data.materials.append(M['pele'])
    meshes = {'corpo': ob}

    def add(name, cage, mat, sub=0, attrs=None):
        me = kit.cage_to_mesh(cage, name, 50.0, attrs)
        me.materials.append(M[mat])
        o = bpy.data.objects.new(name, me)
        col.objects.link(o)
        if sub:
            md = o.modifiers.new('Sub', 'SUBSURF')
            md.levels = sub
            md.render_levels = sub
            o = sculpt.apply_mods(o)
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
        meshes[name] = o
        return o

    rng = np.random.default_rng(11)
    # ---------------- olhos de fogo
    eyes = geo.Cage()
    for sx, side in ((1, 'r'), (-1, 'l')):
        out = geo.unit(F + np.array((0.28 * sx, 0, 0.02)))
        eyes.merge(org.eye(lm['olho_' + side] + out * 0.0015, (0.0125, 0.0055, 0.006), out, tilt=10 * sx))
    add('olhos', eyes, 'olho')
    # ---------------- cabeleira de fogo
    Vn = sculpt.verts(ob)
    Nn = sculpt.normals(ob)
    head_c = np.array((0.0, 0.012, 1.775))
    rel = Vn - head_c
    scalp = np.nonzero((Vn[:, 2] > 1.778) & (np.linalg.norm(rel, axis=1) < 0.13) & ((Vn[:, 1] > -0.06) | (Vn[:, 2] > 1.83))
                       & (np.abs(Vn[:, 0]) < 0.07 + (Vn[:, 2] - 1.778) * 0.6))[0]
    roots = rng.choice(scalp, size=min(170, len(scalp)), replace=False)
    hair = geo.Cage()
    hs = []
    for vi in roots:
        p = Vn[vi] - Nn[vi] * 0.003
        n = Nn[vi]
        top = (Vn[vi, 2] - 1.778) / 0.09
        d = geo.unit(n * 0.6 + UP * (0.9 + 0.4 * top) + np.array((0, 0.35, 0)))
        L = rng.uniform(0.12, 0.2) + 0.16 * np.clip(top, 0, 1) + rng.uniform(0, 0.06)
        cg, sv = flame_lock(p, d, L, rng.uniform(0.011, 0.02), rng)
        hair.merge(cg)
        hs += sv
    add('cabelo', hair, 'cabelo', 1, {'s': hs})
    # ---------------- saia de fibras com cinto trançado
    zb = 1.0
    th, rad = section(V, zb, (0.0, 0.012), pad=0.004, rmax=0.2)
    belt = [np.array((cos(a) * r, 0.012 + sin(a) * r, zb + 0.012 * cos(a + pi / 2) * -1.0)) for a, r in zip(th, rad)]
    belt.append(belt[0])
    add('cinto', org.twisted_rope(belt, 0.0085, 3, 60), 'corda')
    belt2 = [p + np.array((0, 0, -0.016)) * 1.0 + geo.unit(np.array((p[0], p[1] - 0.012, 0))) * 0.004 for p in belt]
    add('cinto2', org.twisted_rope(belt2, 0.0055, 3, 70), 'corda')
    skirt = geo.Cage()
    ss = []
    knots = geo.Cage()
    for layer, (nb, pad, Lr, flare, wr) in enumerate(((64, 0.004, (0.3, 0.4), 0.14, (0.003, 0.0055)), (58, 0.013, (0.2, 0.3), 0.26, (0.0035, 0.006)))):
        for bi in range(nb):
            a0 = tau * (bi + 0.5 * layer) / nb + rng.uniform(-0.02, 0.02)
            j = int((a0 % tau) / tau * len(th)) % len(th)
            r = rad[j] + pad
            radial = np.array((cos(a0), sin(a0), 0.0))
            tang = np.array((-sin(a0), cos(a0), 0.0))
            root0 = np.array((0.0, 0.012, zb - 0.014 - layer * 0.006)) + radial * r
            front = -sin(a0)
            Lb = rng.uniform(*Lr) * (1.0 - 0.18 * max(0.0, front))
            dB = geo.unit(radial * (flare + rng.uniform(-0.04, 0.05)) - UP + tang * rng.uniform(-0.08, 0.08))
            knots.merge(geo.torus(root0 + radial * 0.003, tang, 0.006, 0.0022, 12, 6))
            for f in range(rng.integers(6, 11)):
                root = root0 + tang * rng.uniform(-0.009, 0.009) + UP * rng.uniform(-0.004, 0.004)
                d = geo.unit(dB + rng.normal(0, 0.05, 3))
                L = Lb * rng.uniform(0.75, 1.12)
                cg, sv = org.fiber_strand(root, d, L, rng.uniform(*wr), 0.0011, rng, 0.35, droop=(0, 0, -0.3), out=radial)
                skirt.merge(cg)
                ss += sv
    add('nos_saia', knots, 'corda')
    add('saia', skirt, 'palha', 0, {'s': ss})
    # ---------------- colar de dentes e sementes
    zn = 1.53
    thn, radn = section(V, zn, (0.0, 0.0), band=0.006, pad=0.006, rmax=0.085)
    neck = [np.array((cos(a) * r, sin(a) * r, zn - 0.03 * max(0.0, -sin(a)) ** 2)) for a, r in zip(thn, radn)]
    neck.append(neck[0])
    add('colar_cordao', org.twisted_rope(neck, 0.0028, 2, 50), 'corda')
    teeth = geo.Cage()
    seeds = geo.Cage()
    for i in range(-9, 10):
        a = -pi / 2 + i * 0.13
        j = int((a % tau) / tau * len(thn)) % len(thn)
        p = np.array((cos(a) * radn[j], sin(a) * radn[j], zn - 0.03 * max(0.0, -sin(a)) ** 2))
        outw = geo.unit(np.array((cos(a), sin(a), 0.0)))
        if i % 2 == 0:
            tip = p - UP * (0.038 - abs(i) * 0.0012) + outw * 0.012
            teeth.merge(geo.sweep([p, (p + tip) / 2 + outw * 0.006, tip], geo.circle(8, 0.0058), 10, ref=outw,
                                  scale=lambda s: (1 - s) ** 0.8 + 0.05, caps=(True, True)))
        else:
            seeds.merge(geo.ellipsoid(p + outw * 0.003 - UP * 0.004, (0.0055, 0.0055, 0.0065), nu=12, nv=8))
    add('colar_dentes', teeth, 'dente', 1)
    add('colar_sementes', seeds, 'semente', 1)
    # ---------------- amarrações de fibra (pulsos, tornozelos, braço)
    wraps = geo.Cage()
    for side in ('r', 'l'):
        E, W = lm['cotovelo_' + side], lm['pulso_' + side]
        ax = geo.unit(W - E)
        wraps.merge(org.rope_wrap(W - ax * 0.035, ax, 0.031, 0.045, 7, 0.0035))
        S = lm['ombro_' + side]
        ax2 = geo.unit(E - S)
        if side == 'r':
            wraps.merge(org.rope_wrap(S + ax2 * 0.1, ax2, 0.05, 0.03, 4, 0.004))
        A = lm['tornozelo_' + side]
        wraps.merge(org.rope_wrap(A + UP * 0.07, UP, 0.034, 0.05, 7, 0.0036))
    add('amarracoes', wraps, 'corda')
    # ---------------- lança na mão direita
    pal = lm['palma_r']
    sp = org.spear(np.array((pal[0], pal[1], 0.02)), np.array((pal[0], pal[1], 2.08)))
    for key, cg in sp.items():
        add('lanca_' + key, cg, key, 1 if key in ('madeira', 'pedra') else 0)

    # ---------------- esqueleto e pesos
    arm = skeleton(col, lm, body)
    rigmod.heat_weights(ob, arm)
    rigid_map = {'olhos': 'cabeca', 'cabelo': 'cabelo', 'cinto': 'corpo', 'cinto2': 'corpo', 'saia': 'corpo', 'nos_saia': 'corpo',
                 'colar_cordao': 'peito', 'colar_dentes': 'peito', 'colar_sementes': 'peito', 'amarracoes': None}
    for name, o in meshes.items():
        if name == 'corpo':
            continue
        if name.startswith('lanca_'):
            rigmod.rigid(o, arm, 'mao_r')
        elif name == 'amarracoes':
            transfer_nearest(ob, o, arm)
        elif name == 'saia':
            skirt_weights(o, arm)
        else:
            rigmod.rigid(o, arm, rigid_map[name])
    anchors(arm, [('FX_cabelo', 'cabelo', np.array((0, 0.06, 2.0))), ('FX_olhos', 'cabeca', (lm['olho_r'] + lm['olho_l']) / 2),
                  ('FX_mao_r', 'mao_r', lm['palma_r']), ('FX_mao_l', 'mao_l', lm['palma_l']),
                  ('FX_pe_r', 'pe_r', lm['pe_r']), ('FX_pe_l', 'pe_l', lm['pe_l'])])
    hero = Hero(ID, col, arm, meshes, lm)
    return hero


def skeleton(col, lm, body):
    lm = dict(lm)
    lm['k'] = body.k
    bones = human_bones(ID, lm, extra=[('cabelo', (0, 0.02, 1.84), (0, 0.07, 2.05), 'cabeca')])
    return rigmod.armature(ID + '_esqueleto', bones, col)


def skirt_weights(o, arm):
    """Fibras da saia: raiz presa ao quadril, ponta acompanha a coxa do mesmo lado."""
    V = sculpt.verts(o)
    s = np.zeros(len(V))
    if 's' in o.data.attributes:
        o.data.attributes['s'].data.foreach_get('value', s)
    side = np.where(V[:, 0] >= 0, 1, 0)
    t = np.clip(s, 0, 1) * 0.75 * np.clip(np.abs(V[:, 0]) / 0.08, 0.3, 1.0)
    W = np.zeros((len(V), 3))
    W[:, 0] = 1 - t
    W[:, 1] = t * side
    W[:, 2] = t * (1 - side)
    rigmod.assign(o, ['corpo', 'coxa_r', 'coxa_l'], W)
    rigmod.bind(o, arm)


# ====================================================================== apresentação (render)
def pose_hero(hero):
    arm = hero.arm
    rot_world(arm, 'coluna', (0, 0, 1), 5)
    rot_world(arm, 'coxa_l', (0, 1, 0), 4)
    rot_world(arm, 'coxa_r', (0, 1, 0), -3)
    rot_world(arm, 'coxa_l', (1, 0, 0), -6)
    rot_world(arm, 'canela_l', (1, 0, 0), 9)
    rot_world(arm, 'braco_l', (1, 0, 0), -42)
    rot_world(arm, 'braco_l', (0, 1, 0), 14)
    rot_world(arm, 'antebraco_l', (1, 0, 0), -42)
    rot_world(arm, 'mao_l', (1, 0, 0), -25)
    rot_world(arm, 'cabeca', (0, 0, 1), -10)
    rot_world(arm, 'cabeca', (1, 0, 0), 6)


def footprint(c, yaw, s=1.0, flip=False):
    """Pegada do Curupira: calcanhar para a frente, dedos para trás (+Y)."""
    Rz = geo.rot((0, 0, 1), yaw)
    shapes = []
    heel = [(cos(a) * 0.045, -0.07 + sin(a) * 0.04) for a in np.linspace(0, tau, 16, endpoint=False)]
    sole = [(cos(a) * 0.038, 0.0 + sin(a) * 0.06) for a in np.linspace(0, tau, 16, endpoint=False)]
    shapes += [heel, sole]
    for i, dx in enumerate((-0.03, -0.012, 0.005, 0.02, 0.032)):
        shapes.append([(dx + cos(a) * 0.009, 0.085 - abs(dx) * 0.4 + sin(a) * 0.013) for a in np.linspace(0, tau, 10, endpoint=False)])
    out = []
    for sh in shapes:
        P = np.array([((-x if flip else x) * s, y * s, 0.0) for (x, y) in sh]) @ Rz.T + np.asarray(c)
        out.append((P[:, :2] - np.asarray(c)[:2] + np.asarray(c)[:2], 0.002))
    return out


def _fill_points(poly, n, rng):
    """Pontos espalhados dentro de um polígono 2D convexo-ish (centro -> vértices)."""
    P = np.asarray(poly, float)
    c = P.mean(0)
    k = rng.integers(0, len(P), n)
    t = np.sqrt(rng.uniform(0, 1, n))[:, None]
    return c + (P[k] - c) * t


def present(hero, mode, a, path):
    from . import stage, fx, mats, fogo, mata
    from .humano import posed_points, attr
    w, h = map(int, a.res.split('x'))
    if mode == 'retrato':
        w, h = 1080, 1350
    if mode == 'argila':
        return clay(hero, a, path)
    arm = hero.arm
    lm = hero.lm
    cyc = stage.cycles()
    sim = cyc and fogo.available() and not a.nofx
    stage.setup_render((w, h), a.samples, 0.05, volumetric=True)
    if cyc:
        # noite na mata: lua (luz direcional fria) recortada pela copa -> chão salpicado e fachos na névoa;
        # quem ilumina o Curupira de verdade é o próprio fogo (cabelo, mão, rachaduras)
        stage.world(horizon=(0.005, 0.012, 0.014), zenith=(0.001, 0.003, 0.005), fog=0.008, fog_color=(0.62, 0.82, 0.8))
        stage.sun_light('Lua', (0.32, -0.5, -1.0), 3.2, (0.6, 0.78, 1.0), 0.7)
        mata.canopy('copa', 8.0, holes=0.5, scale=0.3, seed=3.0)
        stage.area_light('Recorte_frio', (-2.6, 2.4, 2.6), (0, 0, 1.3), 140.0, (0.4, 0.68, 0.95), 1.2, 0.0)
        stage.area_light('Preenchimento', (2.5, -3.5, 1.5), (0, 0, 1.0), 14.0, (0.45, 0.62, 0.75), 4.0, 0.0)
    else:
        stage.world(horizon=(0.012, 0.03, 0.03), zenith=(0.002, 0.006, 0.008), fog=0.024, fog_color=(0.55, 0.85, 0.75))
        # luz da lua atravessando a copa (fachos na névoa) + recortes
        stage.spot_light('Lua', (-2.2, 3.5, 9.0), (0.1, 0.0, 0.8), 9000.0, (0.62, 0.85, 1.0), 26, 0.5, 0.25, 1.0)
        stage.area_light('Recorte_frio', (-2.6, 2.2, 2.4), (0, 0, 1.3), 520.0, (0.35, 0.7, 0.9), 1.5, 0.05)
        stage.area_light('Preenchimento', (2.5, -3.5, 1.5), (0, 0, 1.0), 120.0, (0.4, 0.7, 0.6), 4.0, 0.0)
        stage.area_light('Principal', (2.4, -3.2, 3.2), (0, 0, 1.3), 220.0, (0.95, 0.9, 1.0), 2.5, 0.0)
    feet = [(lm['pe_r'][0], lm['pe_r'][1], 0.13), (lm['pe_l'][0], lm['pe_l'][1], 0.13)]
    org.forest(seed=7, rich=cyc, avoid=feet)
    pose_hero(hero)
    if cyc:
        hero.meshes['cabelo'].data.materials[0] = org.ember_strands('cur_cabelo_brasa', 3.2)
    if not a.nofx:
        rng = np.random.default_rng(5)
        hot = fx.tongue_material('cur_lingua', 3.2)
        ember = mats.emission_only('cur_fagulha', (1.0, 0.45, 0.08), 7.0)[0]
        ember2 = mats.emission_only('cur_brasa_ar', (1.0, 0.32, 0.05), 3.5)[0]
        firefly = mats.emission_only('cur_vagalume', (0.75, 1.0, 0.35), 5.0)[0]
        top = bone_world(arm, 'cabelo', (0, 0.05, 1.95))
        hand = bone_world(arm, 'mao_l', lm['palma_l']) + np.array((0, -0.03, 0.08))
        shapes, groots = [], []
        for k, (px, py, yaw) in enumerate(((0.12, 0.55, 0.15), (-0.12, 0.95, 0.05), (0.14, 1.4, 0.2), (-0.1, 1.85, 0.1), (0.12, 2.3, 0.15))):
            shapes += footprint((px, py, 0.0), yaw, 1.05, flip=k % 2 == 1)
            groots.append((px, py, 0.0))
        if sim:
            fire_params = dict(burn_rate=2.4, flame_decay=3.2, cooling=1.35, buoyancy=8.5, vorticity=7.0, turbulence=3.0, smoke=0.45)
            # ---- cabeleira em chamas: o fogo sai das próprias mechas
            hairob = hero.meshes['cabelo']
            Vh = posed_points(hairob)
            sh = attr(hairob, 's')
            sel = np.nonzero(sh > 0.15)[0]
            sel = rng.choice(sel, size=min(6000, len(sel)), replace=False)
            P, wts = Vh[sel], 0.35 + 0.65 * sh[sel]
            lo = P.min(0) - (0.14, 0.14, 0.04)
            hi = P.max(0) + (0.14, 0.3, 0.6)
            fogo.simulate('fogo_cabelo', lo, hi - lo, 0.0065,
                          lambda f: f.add_points(P, 0.011, fuel=1.4, temp=1.0, vel=(0.0, 0.2, 0.45), weights=wts, flicker=0.7),
                          seconds=1.5, mat=fogo.fire_material('fogo_cabelo_mat', 12.0, 1.0, temp_glow=0.55), seed=1,
                          **dict(fire_params, burn_rate=4.0, cooling=1.8))
            # ---- Fogo Guardião: bola de fogo girando na mão esquerda
            S = rng.normal(0, 1, (700, 3))
            S /= np.linalg.norm(S, axis=1, keepdims=True)
            Ph = hand + S * 0.05
            tang = np.cross(np.array((0, 0, 1.0)), S)
            Vb = tang * 0.7 + np.array((0, 0, 0.45))
            fogo.simulate('fogo_mao', hand - (0.22, 0.22, 0.12), (0.44, 0.44, 0.8), 0.005,
                          lambda f: f.add_points(Ph, 0.012, fuel=1.2, temp=1.0, vel=Vb, flicker=0.6),
                          seconds=1.5, mat=fogo.fire_material('fogo_mao_mat', 12.0, 1.2, temp_glow=0.45), seed=2,
                          **dict(fire_params, burn_rate=3.5, cooling=2.4))
            # ---- Passos Incandescentes: chamas baixas saindo das pegadas
            Pf = np.concatenate([np.c_[_fill_points(poly, 40, rng), np.full(40, 0.012)] for poly, _ in shapes])
            fogo.simulate('fogo_pegadas', (-0.42, 0.22, 0.0), (0.86, 2.46, 0.5), 0.01,
                          lambda f: f.add_points(Pf, 0.012, fuel=1.1, temp=1.0, vel=(0, 0.05, 0.25), flicker=0.8),
                          seconds=1.2, mat=fogo.fire_material('fogo_pegadas_mat', 12.0, 0.8, temp_glow=0.5), seed=3,
                          **dict(fire_params, buoyancy=6.0))
        else:
            # ---- cabeleira em chamas: volume sobre as mechas, línguas saindo das pontas
            fx.fire_volume('fogo_cabelo', top + (0, 0.02, -0.07), 0.24, 0.62, strength=2.6, density=6.0, seed=1.3,
                           R=geo.rot((1, 0, 0), radians(-14)))
            hairob = hero.meshes['cabelo']
            Vh = sculpt.verts(hairob)
            sh = np.zeros(len(Vh))
            hairob.data.attributes['s'].data.foreach_get('value', sh)
            Mh = np.array(hairob.matrix_world)
            tips = Vh[sh > 0.92]
            tips = tips[rng.choice(len(tips), size=min(40, len(tips)), replace=False)]
            tipsw = (np.c_[tips, np.ones(len(tips))] @ Mh.T)[:, :3]
            fx.tongues('linguas_cabelo', tipsw - np.array((0, 0, 0.04)), [(rng.normal(0, 0.2), 0.3 + rng.uniform(0, 0.3), 1.0) for _ in tipsw],
                       rng.uniform(0.1, 0.24, len(tipsw)), rng.uniform(0.02, 0.035, len(tipsw)), hot, seed=2, wobble=0.45)
            # ---- Fogo Guardião: esfera de fogo na mão esquerda
            fx.fire_volume('fogo_mao', hand + (0, 0, -0.08), 0.16, 0.42, strength=6.0, density=8.0, seed=4.2, scale=(4, 4, 2.2))
            roots, dirs = [], []
            for k in range(16):
                ang = tau * k / 16
                roots.append(hand + np.array((cos(ang) * 0.07, sin(ang) * 0.07, -0.02 + rng.uniform(-0.03, 0.03))))
                dirs.append((-sin(ang) * 0.8, cos(ang) * 0.8, 0.9))
            fx.tongues('redemoinho_mao', roots, dirs, rng.uniform(0.1, 0.2, 16), rng.uniform(0.018, 0.03, 16), hot, seed=7, wobble=0.5)
            fx.tongues('chamas_pegadas', [np.asarray(p) + (rng.uniform(-0.04, 0.04), rng.uniform(-0.06, 0.06), 0) for p in groots for _ in range(3)],
                       [(rng.uniform(-0.2, 0.2), rng.uniform(-0.1, 0.3), 1.0) for _ in range(15)], rng.uniform(0.06, 0.16, 15),
                       rng.uniform(0.018, 0.035, 15), hot, seed=11)
        # ---- fagulhas e brasas subindo do cabelo e da mão
        fx.streaks('faiscas_cabelo', top + (0, 0.05, 0.1), 60, 0.35, 1.2, ember, seed=3, length=(0.02, 0.06), thick=0.0016)
        fx.motes('brasas_cabelo', top + (0, 0.1, 0.1), 80, 0.5, 1.6, 0.0035, ember2, seed=4)
        fx.streaks('faiscas_mao', hand, 50, 0.22, 0.5, ember, seed=8, swirl=1.2, length=(0.015, 0.05), thick=0.0014)
        # ---- pegadas invertidas em brasa atrás dele
        fx.glow_decals('pegadas', shapes, mats.emission_only('cur_pegada', (1.0, 0.3, 0.04), 3.0)[0])
        for i, p in enumerate(groots):
            stage.point_light(f'luz_pegada{i}', (p[0], p[1], 0.1), 8.0, (1.0, 0.4, 0.1), 0.05)
        # ---- vaga-lumes, brasas no ar e névoa baixa
        fx.motes('vagalumes', (0, 1.6 if cyc else 1.0, 0.3), 90 if not cyc else 45, 4.5 if not cyc else 3.6, 2.6, 0.006 if not cyc else 0.004,
                 firefly, seed=12)
        fx.motes('brasas_ar', (0, 0.3, 0.2), 120, 2.0, 2.4, 0.003, ember2, seed=13)
        fx.smoke_volume('nevoa_chao', (0, 0.6, -0.05), 4.5, 0.6, density=1.2 if not cyc else 0.5, seed=9.0,
                        color=(0.5, 0.7, 0.65), scale=(0.6, 0.6, 1.0))
        # ---- luzes do fogo (no Cycles volumes emissivos não são amostrados como luz: estas fazem esse papel)
        stage.point_light('luz_cabelo', top + (0, 0, 0.1), 90.0 if not cyc else 70.0, (1.0, 0.45, 0.12), 0.12 if not cyc else 0.16)
        stage.point_light('luz_mao', hand, 110.0, (1.0, 0.42, 0.1), 0.08)
        stage.point_light('luz_brasas_corpo', np.array((0.0, -0.4, 1.2)), 25.0, (1.0, 0.35, 0.08), 0.3)
    if mode == 'retrato':
        if cyc:
            stage.camera((1.15, -3.6, 1.1), (0.0, 0.0, 1.36), 42, 2.4, focus=(0.0, -0.05, 1.55))
        else:
            stage.camera((1.1, -3.3, 1.05), (0.0, 0.0, 1.22), 46, 2.4, focus=(0.0, -0.05, 1.55))
    elif mode == 'close':
        stage.camera((0.45, -1.25, 1.85), (0.0, 0.0, 1.72), 60, 1.6, focus=(0.0, -0.08, 1.74))
    else:
        stage.camera((1.6, -4.4, 1.0), (0.1, 0.2, 1.15), 40, 2.6, focus=(0.0, -0.05, 1.5))
    stage.render(path)


