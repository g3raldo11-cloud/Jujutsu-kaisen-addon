"""Constrói os personagens mecanizados no Blender, renderiza e exporta .glb.

Uso (linha de comando, Blender 4.x). Estilo orgânico por padrão; --estilo mecanico gera a versão de armadura:
    blender -b -P build.py -- --hero curupira --render beauty --export ../assets/models
    blender -b -P build.py -- --hero all --export ../assets/models
    blender -P build.py -- --hero saci          (abre o Blender com a cena montada)

Opções:
    --hero       curupira | saci | boitata | all
    --render     lista separada por vírgulas: preview, beauty, close, back
    --export     pasta onde salvar <hero>.glb (feito por último: simplifica os materiais)
    --save       salva o .blend (opcional)
    --detail     nível de subdivisão das placas (2 = padrão, >500 mil polígonos)
    --samples    amostras do EEVEE (64)
    --res        resolução, ex.: 1600x900
"""
import argparse
import faulthandler
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

from lendas3d import kit, stage, mats  # noqa: E402
from lendas3d import mec_curupira, mec_saci, mec_boitata  # noqa: E402

# versão mecanizada (alternativa); a versão orgânica é registrada abaixo quando existir
MECH = {'curupira': mec_curupira, 'saci': mec_saci, 'boitata': mec_boitata}
HEROES = {}
for _n in ('curupira', 'saci', 'boitata'):
    try:
        HEROES[_n] = __import__('lendas3d.' + _n, fromlist=['build'])
    except ImportError:
        pass


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--hero', default='curupira')
    ap.add_argument('--render', default='')
    ap.add_argument('--out', default=os.path.join(HERE, 'renders'))
    ap.add_argument('--export', default='')
    ap.add_argument('--save', default='')
    ap.add_argument('--detail', type=int, default=2)
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--res', default='1600x900')
    ap.add_argument('--nofx', action='store_true')
    ap.add_argument('--views', default='')
    ap.add_argument('--faces', type=int, default=110000, help='faces do .glb de jogo (0 = resolução cheia)')
    ap.add_argument('--pose', action='store_true')
    ap.add_argument('--estilo', default='organico', choices=['organico', 'mecanico'])
    return ap.parse_args(argv)


def reset_pose(rig):
    if hasattr(rig, 'reset_pose'):
        rig.reset_pose()
        return
    rig.root.location = (0, 0, 0)
    for n in rig.nodes.values():
        n.rotation_mode = 'XYZ'
        n.rotation_euler = (0, 0, 0)
        n.scale = (1, 1, 1)


def export_glb(rig, folder, mod, target=None):
    reset_pose(rig)
    if hasattr(rig, 'prepare_export'):
        rig.prepare_export(target)
    elif hasattr(mod, 'prepare_export'):
        mod.prepare_export(rig)
    mats.simplify_for_export([m for m in bpy.data.materials])
    lc = bpy.context.view_layer.layer_collection.children[rig.id]
    bpy.context.view_layer.active_layer_collection = lc
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, rig.id + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_active_collection=True,
                              use_active_collection_with_nested=True, export_apply=True,
                              # o mapa UV leva os dados de brasa / ponta da mecha / borda da escama para os shaders
                              export_texcoords=True, export_normals=True, export_tangents=False, export_colors=False,
                              export_materials='EXPORT', export_cameras=False, export_lights=False, export_animations=False,
                              export_yup=True, export_extras=False, export_skins=True)
    print('EXPORT', path, round(os.path.getsize(path) / 1e6, 1), 'MB')
    return path


def preview(rig, mod, out, a):
    w, h = map(int, a.res.split('x'))
    stage.setup_render((w, h), a.samples, 0.05, volumetric=False)
    stage.world(fog=0.0)
    color = getattr(mod, 'HERO_COLOR', (1, 0.5, 0.2))
    stage.studio(color)
    rig.root.location.z = stage.pedestal(color)
    top = getattr(mod, 'HEIGHT', 2.1)
    cams = getattr(mod, 'PREVIEW_CAMS', None) or [
        ('frente', (1.3, -3.3, 1.25), (0, 0, top * 0.52), 40),
        ('costas', (-1.6, 3.1, 1.5), (0, 0, top * 0.55), 40),
        ('lado', (3.4, -0.4, 1.2), (0, 0, top * 0.5), 40),
        ('rosto', (0.35, -1.25, 1.85), (0, 0, top * 0.84), 50),
    ]
    only = [c for c in a.views.split(',') if c] if a.views else None
    for name, loc, target, lens in cams:
        if only and name not in only:
            continue
        cam = stage.camera(loc, target, lens, 0)
        stage.render(os.path.join(out, f'{rig.id}_{name}.png'))
        bpy.data.objects.remove(cam)


def main():
    faulthandler.enable()
    a = args()
    table = MECH if a.estilo == 'mecanico' else HEROES
    heroes = list(table) if a.hero == 'all' else [a.hero]
    report = {}
    os.makedirs(a.out, exist_ok=True)
    for hero in heroes:
        mod = table[hero]

        def fresh(render=False):
            kit.reset()
            t0 = time.time()
            rig = mod.build_render(a.detail) if (render and hasattr(mod, 'build_render')) else mod.build(a.detail)
            st = rig.stats()
            st['seconds'] = round(time.time() - t0, 1)
            report[hero] = st
            print('STATS', hero, json.dumps(st))
            return rig

        modes = [m for m in a.render.split(',') if m]
        # cada render parte de uma cena limpa (efeitos e luzes não se acumulam)
        for m in modes:
            rig = fresh(render=(m != 'preview'))
            if m == 'preview':
                if hasattr(mod, 'prepare_preview'):
                    mod.prepare_preview(rig)
                if a.pose and hasattr(mod, 'pose_hero'):
                    mod.pose_hero(rig)
                preview(rig, mod, a.out, a)
            elif hasattr(mod, 'present'):
                mod.present(rig, m, a, os.path.join(a.out, f'{hero}_{m}.png'))
        if a.save or a.export or not modes:
            rig = fresh()
            if a.save:
                bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.save, hero + '.blend'))
            if a.export:
                p = export_glb(rig, a.export, mod, a.faces or None)
                report[hero]['glb_mb'] = round(os.path.getsize(p) / 1e6, 1)
    with open(os.path.join(a.out, 'stats.json'), 'w') as f:
        json.dump(report, f, indent=2)
    print('REPORT', json.dumps(report))


if __name__ == '__main__':
    main()
