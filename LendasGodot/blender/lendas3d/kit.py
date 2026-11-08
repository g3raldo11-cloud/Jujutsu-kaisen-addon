"""Ponte entre as gaiolas (geo.py) e o Blender: objetos, modificadores, pivôs e finalização.

Organização de cada personagem (é o que vai para o .glb):

    <id>                      vazio raiz
      corpo                   pivô (vazio) — identidade no repouso, só translação em relação ao pai
        corpo_malha           malha rígida (todas as peças do pivô, modificadores aplicados)
        coxa_l ...            pivôs filhos (ombros, cotovelos, cabeça...)
        FX_*                  vazios-âncora de efeitos (fogo, fumaça, faíscas) usados pelo Godot/web
        GIRO_<eixo>_*         pivôs que giram sem parar (turbinas, hélices)

Personagens mecânicos não precisam de pesos de pele: cada peça é rígida e segue o seu pivô,
como num robô de verdade. O Godot e o Hero Select giram esses pivôs.
"""
import bpy
import bmesh
import numpy as np
from math import radians
from mathutils import Matrix, Vector

from . import geo


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def collection(name, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def cage_to_mesh(cage, name, smooth_angle=35.0, attrs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(cage.verts, [], cage.faces)
    if cage.mats:
        me.polygons.foreach_set('material_index', cage.mats)
    for an, vals in (attrs or {}).items():
        a = me.attributes.new(an, 'FLOAT', 'POINT')
        a.data.foreach_set('value', [float(x) for x in vals])
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.use_auto_smooth = True
    me.auto_smooth_angle = radians(smooth_angle)
    return me


def deselect_all():
    for o in bpy.context.view_layer.objects:
        o.select_set(False)


class Rig:
    """Pivôs (vazios) + peças por pivô; ``finalize`` aplica modificadores e junta por pivô."""

    def __init__(self, hero_id, mats):
        self.id = hero_id
        self.mats = mats
        self.col = collection(hero_id)
        self.nodes = {}
        self.world = {}
        self.parts = {}
        self.meshes = {}
        self.rest = {}
        self.root = self.pivot(hero_id, (0, 0, 0), None)

    # ---------------------------------------------------------- pivôs
    def pivot(self, name, world_pos, parent='corpo', kind='PLAIN_AXES', size=0.06, axis=None):
        """Vazio-pivô. ``axis`` (só para folhas como GIRO_*) orienta o eixo Z local do Blender, que
        no glTF/Godot/three.js vira o eixo Y local: é em torno dele que o motor faz a peça girar."""
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = kind
        e.empty_display_size = size
        self.col.objects.link(e)
        if parent is None or parent not in self.nodes:
            parent = None if name == self.id else self.id
        wp = np.asarray(world_pos, float)
        if parent is not None:
            e.parent = self.nodes[parent]
            e.location = Vector(wp - self.world[parent])
        else:
            e.location = Vector(wp)
        R = Matrix.Identity(3)
        if axis is not None:
            q = Vector(tuple(float(c) for c in axis)).normalized().to_track_quat('Z', 'Y')
            e.rotation_mode = 'QUATERNION'
            e.rotation_quaternion = q
            R = q.to_matrix()
        self.nodes[name] = e
        self.world[name] = wp
        self.rest[name] = Matrix.Translation(Vector(wp)) @ R.to_4x4()
        self.parts.setdefault(name, [])
        return e

    def anchor(self, name, world_pos, parent):
        """Vazio-âncora de efeito (FX_*) ou de encaixe."""
        return self.pivot(name, world_pos, parent, 'SPHERE', 0.03)

    # ---------------------------------------------------------- peças
    def add(self, pivot, cage, mats, bevel=None, sub=0, name=None, angle=30.0, smooth=35.0):
        """Cria a peça (em coordenadas do mundo) com Bevel → Subsurf e a registra no pivô.

        ``mats``: lista de nomes de material, na ordem dos índices usados na gaiola.
        ``bevel``: (largura, segmentos) — chanfro nas quinas acima de ``angle`` graus.
        """
        if not cage.faces:
            return None
        name = name or f"{pivot}_peca{len(self.parts[pivot])}"
        me = cage_to_mesh(cage, name, smooth)
        for m in mats:
            me.materials.append(self.mats[m])
        ob = bpy.data.objects.new(name, me)
        self.col.objects.link(ob)
        if bevel:
            md = ob.modifiers.new('Chanfro', 'BEVEL')
            md.width = bevel[0]
            md.segments = bevel[1]
            md.limit_method = 'ANGLE'
            md.angle_limit = radians(angle)
            md.use_clamp_overlap = True
            md.profile = 0.5
        if sub:
            md = ob.modifiers.new('Subdivisao', 'SUBSURF')
            md.levels = sub
            md.render_levels = sub
        self.parts[pivot].append(ob)
        return ob

    def add_mirror(self, pivot_r, pivot_l, cage, mats, **kw):
        """Peça do lado +X em ``pivot_r`` e sua cópia espelhada (lado -X) em ``pivot_l``."""
        self.add(pivot_r, cage, mats, **kw)
        self.add(pivot_l, cage.mirrored_x(), mats, **kw)

    # ---------------------------------------------------------- finalização
    def finalize(self):
        for pv, objs in self.parts.items():
            objs = [o for o in objs if o is not None]
            if not objs:
                continue
            deselect_all()
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            bpy.ops.object.convert(target='MESH')
            if len(objs) > 1:
                bpy.ops.object.join()
            ob = bpy.context.view_layer.objects.active
            ob.name = f"{pv}_malha"
            ob.data.name = f"{self.id}_{pv}"
            ob.data.use_auto_smooth = True
            ob.data.transform(self.rest[pv].inverted())
            ob.parent = self.nodes[pv]
            ob.matrix_parent_inverse = Matrix.Identity(4)
            ob.location = (0, 0, 0)
            self.meshes[pv] = ob
        deselect_all()

    def stats(self):
        faces = tris = verts = 0
        for ob in self.col.all_objects:
            if ob.type == 'MESH':
                me = ob.data
                faces += len(me.polygons)
                verts += len(me.vertices)
                loops = np.zeros(len(me.polygons), dtype=np.int32)
                me.polygons.foreach_get('loop_total', loops)
                tris += int(np.sum(loops - 2))
        return {'faces': faces, 'tris': tris, 'verts': verts}

    def pose(self, name, rx=0.0, ry=0.0, rz=0.0):
        """Rotação (graus) de um pivô, só para as poses de apresentação no Blender."""
        n = self.nodes[name]
        n.rotation_mode = 'XYZ'
        n.rotation_euler = (radians(rx), radians(ry), radians(rz))


# ------------------------------------------------------------------ utilidades de superfície

def vdir(surf, u, direction, samples=720):
    """Valor de v (0..1) cuja direção a partir do eixo melhor se alinha a ``direction``."""
    vs = np.linspace(0, 1, samples, endpoint=False)
    us = np.full_like(vs, u)
    P = surf.eval(us, vs)
    C = surf.center(us)
    d = geo.unit(P - C)
    k = int(np.argmax(d @ geo.unit(np.asarray(direction, float))))
    return float(vs[k])


def around(v, half):
    """Intervalo (v0, v1) centrado em v (o v pode passar de 1; as superfícies são periódicas)."""
    return v - half, v + half
