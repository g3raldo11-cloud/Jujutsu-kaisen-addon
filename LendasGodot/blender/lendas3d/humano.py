"""Utilidades compartilhadas pelos personagens humanos orgânicos (Curupira e Saci):
resultado da construção (Hero), contornos do corpo, esqueleto, pesos, âncoras de efeitos,
poses por rotação no mundo e a vista em argila com a contagem de polígonos."""
import bpy
import numpy as np
from math import tau, pi, cos, sin, radians
from mathutils import Matrix, Vector

from . import geo, kit, sculpt, org, rig as rigmod

F = np.array((0.0, -1.0, 0.0))
UP = np.array((0.0, 0.0, 1.0))


class Hero:
    """Resultado da construção: armature, malhas, pontos de referência e estatísticas."""

    def __init__(self, hid, col, arm, meshes, lm):
        self.id = hid
        self.col = col
        self.arm = arm
        self.meshes = meshes
        self.lm = lm
        self.root = arm
        self.nodes = {}
        self.world = {k: np.asarray(v) for k, v in lm.items()}

    def stats(self):
        faces = tris = verts = 0
        for ob in self.col.all_objects:
            if ob.type == 'MESH':
                me = ob.data
                faces += len(me.polygons)
                verts += len(me.vertices)
                lt = np.zeros(len(me.polygons), dtype=np.int32)
                me.polygons.foreach_get('loop_total', lt)
                tris += int(np.sum(lt - 2))
        return {'faces': faces, 'tris': tris, 'verts': verts}

    def prepare_export(self, target_faces=None):
        """Versão de JOGO: dizima as malhas grandes até ~``target_faces`` faces no total (o .blend e os
        renders mantêm a resolução cheia) e grava os dados de brasa/borda num mapa UV, que os shaders
        do Godot e do Hero Select leem (u = brasa/borda, v = pele queimada)."""
        self.reset_pose()
        bpy.context.view_layer.update()
        for name, ob in self.meshes.items():
            me = ob.data
            attrs = [a for a in ('brasa', 'borda', 's') if a in me.attributes]
            if attrs:
                n = len(me.vertices)
                u = np.zeros(n)
                me.attributes[attrs[0]].data.foreach_get('value', u)
                v = np.zeros(n)
                if 'cinza' in me.attributes:
                    me.attributes['cinza'].data.foreach_get('value', v)
                uv = me.uv_layers.new(name='dados')
                li = np.zeros(len(me.loops), dtype=np.int64)
                me.loops.foreach_get('vertex_index', li)
                uv.data.foreach_set('uv', np.stack([u[li], v[li]], 1).ravel())
        if not target_faces:
            return
        total = sum(len(o.data.polygons) for o in self.meshes.values())
        if total <= target_faces:
            return
        for name, ob in self.meshes.items():
            nf = len(ob.data.polygons)
            if nf < 6000:
                continue
            ratio = max(0.05, min(1.0, target_faces / total))
            md = ob.modifiers.new('Dizima', 'DECIMATE')
            md.ratio = ratio
            md.use_collapse_triangulate = False
            kit.deselect_all()
            bpy.context.view_layer.objects.active = ob
            ob.select_set(True)
            with bpy.context.temp_override(object=ob, active_object=ob):
                bpy.ops.object.modifier_move_to_index(modifier='Dizima', index=0)
                bpy.ops.object.modifier_apply(modifier='Dizima')
        print('EXPORT_FACES', sum(len(o.data.polygons) for o in self.meshes.values()), flush=True)

    def reset_pose(self):
        self.arm.location = (0, 0, 0)
        for pb in self.arm.pose.bones:
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)


def section(V, z, center=(0.0, 0.0), band=0.006, n=64, pad=0.0, rmax=0.22):
    """Contorno horizontal do corpo na altura z (raio por ângulo), para cintos e colares.
    Só considera pontos a menos de ``rmax`` do eixo (ignora braços e mãos)."""
    sel = V[np.abs(V[:, 2] - z) < band]
    sel = sel[np.linalg.norm(sel[:, :2] - np.asarray(center), axis=1) < rmax]
    th = np.linspace(0, tau, n, endpoint=False)
    rel = sel[:, :2] - np.asarray(center)
    ang = np.arctan2(rel[:, 1], rel[:, 0])
    rad = np.linalg.norm(rel, axis=1)
    out = np.zeros(n)
    for i, a in enumerate(th):
        dif = np.abs((ang - a + pi) % tau - pi)
        m = dif < (tau / n) * 1.5
        out[i] = rad[m].max() if m.any() else (out[i - 1] if i else 0.1)
    return th, out + pad


def skeleton(name, lm, leg_names=('coxa', 'canela', 'pe'), legs=('r', 'l'), extra=()):
    """Esqueleto humano a partir dos pontos de referência da anatomia."""
    bones = [('corpo', (0, 0.01, 0.95 * lm['k']), (0, 0.01, 1.08 * lm['k']), None),
             ('coluna', (0, 0.01, 1.08 * lm['k']), (0, 0.0, 1.3 * lm['k']), 'corpo'),
             ('peito', (0, 0.0, 1.3 * lm['k']), (0, 0.0, 1.5 * lm['k']), 'coluna'),
             ('pescoco', (0, 0.01, 1.5 * lm['k']), (0, -0.005, 1.64 * lm['k']), 'peito'),
             ('cabeca', (0, -0.005, 1.64 * lm['k']), (0, -0.005, 1.86 * lm['k']), 'pescoco')]
    bones += list(extra)
    for side in ('r', 'l'):
        sx = 1 if side == 'r' else -1
        S, E, W = lm['ombro_' + side], lm['cotovelo_' + side], lm['pulso_' + side]
        bones += [('clavicula_' + side, (0.02 * sx, -0.01, 1.5 * lm['k']), tuple(S), 'peito'),
                  ('braco_' + side, tuple(S), tuple(E), 'clavicula_' + side),
                  ('antebraco_' + side, tuple(E), tuple(W), 'braco_' + side),
                  ('mao_' + side, tuple(W), tuple(lm['dedos_' + side]), 'antebraco_' + side)]
    for side in legs:
        H, K, A = lm['quadril_' + side], lm['joelho_' + side], lm['tornozelo_' + side]
        a, b, c = (n if len(legs) == 1 else n + '_' + side for n in leg_names)
        bones += [(a, tuple(H), tuple(K), 'corpo'), (b, tuple(K), tuple(A), a), (c, tuple(A), tuple(lm['pe_' + side]), b)]
    return bones


def transfer_nearest(src, dst, arm):
    """Pesos de ``dst`` copiados do vértice mais próximo de ``src`` (amarrações acompanham a pele)."""
    from scipy.spatial import cKDTree
    names = [g.name for g in src.vertex_groups]
    Vs = sculpt.verts(src)
    W = np.zeros((len(Vs), len(names)))
    for v in src.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    tree = cKDTree(Vs)
    _, idx = tree.query(sculpt.verts(dst), k=1)
    rigmod.assign(dst, names, W[idx])
    rigmod.bind(dst, arm)


def anchors(arm, items):
    """Vazios-âncora de efeitos presos aos ossos (FX_*): o Godot e o Hero Select acendem efeitos neles.
    ``items``: lista de (nome, osso, posição no mundo em repouso)."""
    bpy.context.view_layer.update()
    for name, bone, pos in items:
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = 'SPHERE'
        e.empty_display_size = 0.03
        arm.users_collection[0].objects.link(e)
        e.parent = arm
        e.parent_type = 'BONE'
        e.parent_bone = bone
        bpy.context.view_layer.update()
        e.matrix_world = Matrix.Translation(Vector(tuple(map(float, pos))))


def rot_world(arm, bone, axis, deg):
    """Gira um osso em torno de um eixo do MUNDO, passando pela cabeça do osso."""
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bone]
    M = pb.matrix.copy()
    h = M.translation.copy()
    R = Matrix.Rotation(radians(deg), 4, Vector(axis))
    pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ M
    bpy.context.view_layer.update()


def bone_world(arm, bone, local=(0, 0, 0)):
    """Posição no mundo de um ponto preso ao osso (em coordenadas de repouso)."""
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bone]
    rest = arm.data.bones[bone].matrix_local
    M = arm.matrix_world @ pb.matrix @ rest.inverted()
    return np.array(M @ Vector(tuple(map(float, local))))


def clay(hero, a, path):
    """Três vistas em argila (frente, costas, lado) com a contagem de polígonos — como uma escultura."""
    from . import stage
    from PIL import Image, ImageDraw, ImageFont
    import os
    st = hero.stats()
    stage.setup_render((720, 1080), a.samples, 0.0, volumetric=False)
    stage.world(horizon=(0.03, 0.03, 0.033), zenith=(0.012, 0.012, 0.014), fog=0)
    stage.area_light('Principal', (2.0, -3.0, 3.5), (0, 0, 1.0), 900.0, (1, 1, 1), 3.0)
    stage.area_light('Recorte', (-2.5, 2.5, 3.0), (0, 0, 1.2), 900.0, (0.9, 0.95, 1.0), 2.0)
    stage.area_light('Preench', (-3.0, -2.0, 1.0), (0, 0, 1.0), 200.0, (1, 1, 1), 4.0)
    clay_m = org.solid('argila', (0.33, 0.33, 0.32), 0.62, 0.0, 400.0, 0.05)
    bpy.context.view_layer.material_override = clay_m
    base = geo.lathe([(0.0, -0.06), (0.42, -0.06), (0.44, -0.03), (0.42, 0.0), (0.0, 0.0)], 64)
    me = kit.cage_to_mesh(base, 'base_argila')
    bo = bpy.data.objects.new('base_argila', me)
    bpy.context.scene.collection.objects.link(bo)
    files = []
    pts = []
    for ob in hero.meshes.values():
        bb = np.array([ob.matrix_world @ Vector(c) for c in ob.bound_box])
        pts.append(bb)
    pts = np.concatenate(pts)
    lo, hi = pts.min(0), pts.max(0)
    cz = (lo[2] + hi[2]) / 2
    ext = max(hi[2] - lo[2], (hi[0] - lo[0]) * 0.75, (hi[1] - lo[1]) * 0.75)
    dist = max(4.6, ext * 2.05)
    for name, loc in (('frente', (0.0, -dist, cz + 0.05)), ('lado', (dist, 0.25, cz + 0.05)), ('costas', (-0.6, dist, cz + 0.05))):
        cam = stage.camera(loc, (0, 0, cz - 0.07), 42, 0)
        f = path.replace('.png', f'_{name}.png')
        stage.render(f)
        bpy.data.objects.remove(cam)
        files.append(f)
    ims = [Image.open(f) for f in files]
    W = sum(i.width for i in ims)
    out = Image.new('RGB', (W, ims[0].height))
    x = 0
    for im in ims:
        out.paste(im, (x, 0))
        x += im.width
    d = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
        small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 22)
    except OSError:
        font = small = None
    d.text((30, 26), f"{hero.id.upper()} — escultura no Blender", fill=(235, 235, 235), font=font)
    d.text((30, 66), f"{st['faces']:,} polígonos  ·  {st['tris']:,} triângulos  ·  {st['verts']:,} vértices".replace(',', '.'),
           fill=(200, 200, 200), font=small)
    out.save(path)
    for f in files:
        os.remove(f)
