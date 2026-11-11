"""Esqueleto (armature) e pesos de pele para exportar personagens orgânicos ao Godot/web.

Os pesos do corpo vêm do "bone heat" do Blender calculado numa cópia simplificada (rápido e
estável) e transferidos para a malha final pelo vértice mais próximo (KD-tree). Peças rígidas
(cabelo, colar, lança...) recebem peso 1 no osso a que pertencem.
"""
import bpy
import numpy as np
from mathutils import Vector

from . import kit, sculpt


def armature(name, bones, col):
    """bones: lista de (nome, cabeça, cauda, pai)."""
    ad = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, ad)
    col.objects.link(ob)
    kit.deselect_all()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for (n, h, t, parent) in bones:
        b = ad.edit_bones.new(n)
        b.head = Vector(tuple(map(float, h)))
        b.tail = Vector(tuple(map(float, t)))
        b.roll = 0.0
        if parent:
            b.parent = eb[parent]
        eb[n] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def heat_weights(body, arm, ratio=0.035, deform=None):
    """Pesos automáticos (bone heat) num proxy decimado, transferidos para ``body``."""
    from scipy.spatial import cKDTree
    me = body.data.copy()
    proxy = bpy.data.objects.new(body.name + '_proxy', me)
    body.users_collection[0].objects.link(proxy)
    md = proxy.modifiers.new('Dec', 'DECIMATE')
    md.ratio = ratio
    proxy = sculpt.apply_mods(proxy)
    kit.deselect_all()
    proxy.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    names = [b.name for b in arm.data.bones if (deform is None or b.name in deform)]
    Vp = sculpt.verts(proxy)
    W = np.zeros((len(Vp), len(names)))
    gi = {vg.index: vg.name for vg in proxy.vertex_groups}
    col_of = {n: i for i, n in enumerate(names)}
    for v in proxy.data.vertices:
        for g in v.groups:
            n = gi.get(g.group)
            if n in col_of:
                W[v.index, col_of[n]] = g.weight
    Vb = sculpt.verts(body)
    tree = cKDTree(Vp)
    d, idx = tree.query(Vb, k=4)
    w = 1.0 / np.maximum(d, 1e-6) ** 2
    w /= w.sum(1, keepdims=True)
    Wb = np.einsum('vk,vkb->vb', w, W[idx])
    s = Wb.sum(1)
    # reserva: onde o bone heat falhou (partes finas), pesos pela distância aos ossos
    Wd = distance_weights(Vb, arm, names)
    weak = s < 0.6
    Wb[weak] = Wd[weak] * (1 - s[weak, None]) + Wb[weak]
    s = Wb.sum(1, keepdims=True)
    Wb = Wb / np.maximum(s, 1e-6)
    # no máximo 4 influências por vértice (glTF)
    if Wb.shape[1] > 4:
        cut = np.sort(Wb, axis=1)[:, -4][:, None]
        Wb = np.where(Wb >= cut, Wb, 0.0)
        Wb = Wb / np.maximum(Wb.sum(1, keepdims=True), 1e-6)
    print('PESOS', len(Vb), 'vértices; reserva por distância em', int(weak.sum()), flush=True)
    bpy.data.objects.remove(proxy)
    assign(body, names, Wb)
    bind(body, arm)
    return names


def distance_weights(V, arm, names, sigma=0.05):
    """Pesos suaves pela distância de cada vértice ao segmento de cada osso (lado certo do corpo)."""
    from .sculpt import _seg_dist
    W = np.zeros((len(V), len(names)))
    for j, n in enumerate(names):
        b = arm.data.bones[n]
        h = np.array(arm.matrix_world @ b.head_local)
        t = np.array(arm.matrix_world @ b.tail_local)
        d = _seg_dist(V, h, t)
        w = np.exp(-(d / sigma) ** 2)
        side = n[-2:]
        if side == '_r':
            w = w * (V[:, 0] > -0.02)
        elif side == '_l':
            w = w * (V[:, 0] < 0.02)
        W[:, j] = w
    best = np.argmax(W, axis=1)
    W[np.arange(len(V)), best] += 1e-3
    return W / np.maximum(W.sum(1, keepdims=True), 1e-9)


def assign(ob, names, W, levels=48):
    """Cria grupos de vértices com pesos quantizados (poucas chamadas da API)."""
    for j, n in enumerate(names):
        vg = ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
        q = np.round(W[:, j] * levels).astype(int)
        for lv in np.unique(q):
            if lv <= 0:
                continue
            ids = np.nonzero(q == lv)[0].tolist()
            vg.add(ids, float(lv) / levels, 'REPLACE')


def rigid(ob, arm, bone):
    vg = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bind(ob, arm)


def bind(ob, arm):
    if not any(m.type == 'ARMATURE' for m in ob.modifiers):
        md = ob.modifiers.new('Esqueleto', 'ARMATURE')
        md.object = arm
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()


def pose(arm, bone, rx=0.0, ry=0.0, rz=0.0):
    """Rotação de um osso (graus, eixos locais do osso) — para as poses de apresentação."""
    from math import radians
    pb = arm.pose.bones[bone]
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = (radians(rx), radians(ry), radians(rz))
