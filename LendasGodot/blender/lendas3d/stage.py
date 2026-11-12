"""Palco de apresentação: render EEVEE (brilho/bloom, sombras suaves, oclusão, reflexos, névoa
volumétrica) ou Cycles (traçado de caminhos com luz global, subsuperfície, volumes e redução de
ruído OIDN), céu em degradê, luzes de estúdio, pedestal mecânico e auréola ao fundo."""
import bpy
import numpy as np
from math import radians, tau, cos, sin
from mathutils import Vector

from . import geo, kit, mats

# 'EEVEE' (Blender 4.0/4.1, rápido) ou 'CYCLES' (realista; obrigatório no Blender 4.2+, cujo EEVEE
# novo não tem as opções usadas abaixo). build.py escolhe com --engine.
ENGINE = 'EEVEE' if bpy.app.version < (4, 2, 0) else 'CYCLES'
# ajustes do Cycles (build.py preenche a partir da linha de comando)
# Filmic: o fogo forte vai de laranja a amarelo e branco como numa foto; o AgX desbota chamas fortes para rosa.
CYCLES = {'threshold': 0.02, 'view': 'Filmic', 'look': 'Medium High Contrast', 'exposure': 0.0, 'glare': 1.0, 'percent': 100}


def cycles():
    return ENGINE == 'CYCLES'


def setup_render(res=(1600, 900), samples=64, bloom=0.06, volumetric=True):
    if cycles():
        return setup_cycles(res, samples, bloom, volumetric)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    e = sc.eevee
    e.taa_render_samples = samples
    e.use_bloom = True
    e.bloom_threshold = 1.0
    e.bloom_knee = 0.5
    e.bloom_intensity = bloom
    e.bloom_radius = 6.5
    e.use_gtao = True
    e.gtao_distance = 0.35
    e.gtao_factor = 1.3
    e.use_ssr = True
    e.use_ssr_halfres = True
    e.ssr_quality = 0.5
    e.use_soft_shadows = True
    e.shadow_cube_size = '1024'
    e.shadow_cascade_size = '4096'
    e.use_shadow_high_bitdepth = True
    e.light_threshold = 0.005
    e.volumetric_start = 0.5
    e.volumetric_end = 40.0
    e.volumetric_tile_size = '4' if volumetric else '16'
    e.volumetric_samples = 64 if volumetric else 16
    e.use_volumetric_lights = True
    e.use_volumetric_shadows = volumetric
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    # 'Standard' mantém o fogo saturado (laranja/amarelo); AgX/Filmic desbotam emissões fortes.
    vs = sc.view_settings
    vs.view_transform = 'Standard'
    try:
        vs.look = 'None'
    except TypeError:
        pass
    vs.exposure = 0.0
    vs.gamma = 1.0
    return sc


def setup_cycles(res=(1600, 900), samples=256, bloom=0.06, volumetric=True):
    """Cycles na CPU: amostragem adaptativa + OIDN (com albedo e normal), luz global limitada a poucos
    saltos (rápido e sem perder o realismo), volumes com passo fino, cores AgX e brilho no compositor."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = CYCLES['threshold']
    if hasattr(cy, 'adaptive_min_samples'):
        cy.adaptive_min_samples = min(64, max(16, samples // 8))
    cy.use_denoising = True
    for k, v in (('denoiser', 'OPENIMAGEDENOISE'), ('denoising_input_passes', 'RGB_ALBEDO_NORMAL'),
                 ('denoising_prefilter', 'ACCURATE'), ('denoising_quality', 'HIGH')):
        if hasattr(cy, k):
            setattr(cy, k, v)
    cy.max_bounces = 10
    cy.diffuse_bounces = 3
    cy.glossy_bounces = 3
    cy.transmission_bounces = 8
    cy.volume_bounces = 1 if volumetric else 0
    cy.transparent_max_bounces = 48       # línguas de fogo e folhas transparentes empilhadas
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    cy.sample_clamp_direct = 0.0
    cy.sample_clamp_indirect = 6.0
    cy.volume_step_rate = 1.0 if volumetric else 2.0
    cy.volume_max_steps = 512
    if hasattr(cy, 'use_light_tree'):
        cy.use_light_tree = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = CYCLES['percent']
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.color_depth = '8'
    vs = sc.view_settings
    try:
        vs.view_transform = CYCLES['view']
        vs.look = CYCLES['look']
    except TypeError:
        vs.view_transform = 'Filmic'
        vs.look = 'None'
    vs.exposure = CYCLES['exposure']
    vs.gamma = 1.0
    compositor(bloom * CYCLES['glare'])
    return sc


def compositor(bloom=0.06):
    """Pós-processamento leve de lente: brilho (bloom) nas fontes fortes (fogo, brasas, olhos) e uma
    dispersão cromática bem sutil nas bordas."""
    sc = bpy.context.scene
    if hasattr(sc.render, 'compositor_device'):
        sc.render.compositor_device = 'CPU'             # sem placa de vídeo (servidor, módulo bpy)
    if hasattr(sc, 'compositing_node_group'):          # Blender 5.x: o compositor é um grupo de nós
        ng = bpy.data.node_groups.new('Pos', 'CompositorNodeTree')
        sc.compositing_node_group = ng
        rl = ng.nodes.new('CompositorNodeRLayers')
        out = ng.nodes.new('NodeGroupOutput')
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        gl = ng.nodes.new('CompositorNodeGlare')
        gl.inputs['Type'].default_value = 'Bloom'
        gl.inputs['Quality'].default_value = 'High'
        gl.inputs['Threshold'].default_value = 1.2
        gl.inputs['Smoothness'].default_value = 0.4
        gl.inputs['Strength'].default_value = min(1.0, bloom * 6.0)
        gl.inputs['Size'].default_value = 0.75
        ld = ng.nodes.new('CompositorNodeLensdist')
        ld.inputs['Dispersion'].default_value = 0.012
        ld.inputs['Distortion'].default_value = 0.0
        ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
        ng.links.new(gl.outputs['Image'], ld.inputs['Image'])
        ng.links.new(ld.outputs['Image'], out.inputs[0])
        return ng
    sc.use_nodes = True                                 # Blender 4.x
    nt = sc.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new('CompositorNodeRLayers')
    comp = nt.nodes.new('CompositorNodeComposite')
    gl = nt.nodes.new('CompositorNodeGlare')
    gl.glare_type = 'FOG_GLOW'
    gl.quality = 'HIGH'
    gl.threshold = 1.2
    gl.mix = -1.0 + min(1.0, bloom * 6.0)
    gl.size = 8
    nt.links.new(rl.outputs['Image'], gl.inputs['Image'])
    nt.links.new(gl.outputs['Image'], comp.inputs['Image'])
    return nt


def world(horizon=(0.03, 0.035, 0.05), zenith=(0.004, 0.005, 0.01), fog=0.012, fog_color=(0.6, 0.65, 0.8)):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('Mundo')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sp.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (*horizon, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*zenith, 1)
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -1.0
    mr.inputs['From Max'].default_value = 1.0
    nt.links.new(sp.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    if fog > 0 and cycles():
        fog_box(fog, fog_color)
    elif fog > 0:
        vol = nt.nodes.new('ShaderNodeVolumePrincipled')
        vol.inputs['Density'].default_value = fog
        vol.inputs['Color'].default_value = (*fog_color, 1)
        vol.inputs['Anisotropy'].default_value = 0.35
        nt.links.new(vol.outputs[0], out.inputs['Volume'])
    return w


def sky(sun_dir, strength=0.3, fog=0.0, fog_color=(1, 1, 1), air=1.0, aerosol=1.0, ozone=1.0):
    """Céu físico (espalhamento da atmosfera: pôr do sol de verdade) com o sol na direção ``sun_dir``
    (para onde fica o sol, visto do chão). O disco do sol fica de fora: quem ilumina é a luz SUN."""
    sc = bpy.context.scene
    w = bpy.data.worlds.new('Ceu')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    sk = nt.nodes.new('ShaderNodeTexSky')
    types = [i.identifier for i in sk.bl_rna.properties['sky_type'].enum_items]
    sk.sky_type = 'MULTIPLE_SCATTERING' if 'MULTIPLE_SCATTERING' in types else 'NISHITA'
    d = np.asarray(sun_dir, float)
    d = d / np.linalg.norm(d)
    sk.sun_elevation = float(np.arcsin(d[2]))
    sk.sun_rotation = float(np.arctan2(d[0], d[1]))      # 0 = sol em +Y, 90° = sol em +X
    sk.sun_disc = False
    for k, v in (('air_density', air), ('aerosol_density', aerosol), ('ozone_density', ozone)):
        if hasattr(sk, k):
            setattr(sk, k, v)
    nt.links.new(sk.outputs[0], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    if fog > 0:
        fog_box(fog, fog_color)
    return w


def fog_box(density, color, half=40.0, top=24.0, anisotropy=0.35):
    """Névoa do Cycles numa caixa grande (e não no mundo): no Cycles o volume do mundo é infinito e
    apagaria a luz do sol/lua, que vem de infinitamente longe."""
    m = bpy.data.materials.new('nevoa')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = density
    vol.inputs['Color'].default_value = (*color, 1)
    vol.inputs['Anisotropy'].default_value = anisotropy
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    c = geo.box((0, 0, (top - 1.0) / 2), (half * 2, half * 2, top + 1.0))
    me = kit.cage_to_mesh(c, 'nevoa')
    me.materials.append(m)
    ob = bpy.data.objects.new('Nevoa', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def area_light(name, loc, target, energy, color=(1, 1, 1), size=2.0, vol=1.0, shape='DISK'):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy
    ld.color = color
    ld.shape = shape
    ld.size = size
    ld.volume_factor = vol
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    _cycles_light(ob, vol)
    return ob


def _cycles_light(ob, vol, shadow=True):
    """No Cycles a luz é física: toda luz faz sombra; as que quase não deviam iluminar a névoa
    (vol baixo no EEVEE) ficam invisíveis para o espalhamento no volume."""
    if not cycles():
        return
    ob.data.use_shadow = shadow
    if hasattr(ob, 'visible_volume_scatter'):
        ob.visible_volume_scatter = vol >= 0.3


def spot_light(name, loc, target, energy, color=(1, 1, 1), angle=30.0, blend=0.6, radius=0.2, vol=1.0):
    ld = bpy.data.lights.new(name, 'SPOT')
    ld.energy = energy
    ld.color = color
    ld.spot_size = radians(angle)
    ld.spot_blend = blend
    ld.shadow_soft_size = radius
    ld.volume_factor = vol
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    _cycles_light(ob, vol)
    return ob


def sun_light(name, toward, strength, color=(1, 1, 1), angle=0.5, vol=1.0):
    """Luz direcional (lua/sol). ``toward``: direção para onde a luz VAI (de cima para baixo)."""
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = strength
    ld.color = color
    ld.angle = radians(angle)
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = Vector(toward).to_track_quat('-Z', 'Y').to_euler()
    _cycles_light(ob, vol)
    return ob


def point_light(name, loc, energy, color, radius=0.1, vol=0.6, shadow=False):
    ld = bpy.data.lights.new(name, 'POINT')
    ld.energy = energy
    ld.color = color
    ld.shadow_soft_size = radius
    ld.volume_factor = vol
    ld.use_shadow = shadow
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    _cycles_light(ob, vol)
    return ob


def camera(loc, target, lens=55.0, fstop=2.2, focus=None, shift_y=0.0):
    cd = bpy.data.cameras.new('Camera')
    cd.lens = lens
    cd.clip_start = 0.05
    cd.clip_end = 200
    cd.shift_y = shift_y
    ob = bpy.data.objects.new('Camera', cd)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cd.dof.use_dof = fstop > 0
    cd.dof.focus_distance = (Vector(focus) - Vector(loc)).length if focus is not None else d.length
    cd.dof.aperture_fstop = max(fstop, 0.1)
    bpy.context.scene.camera = ob
    return ob


def studio(color, rim2=(0.55, 0.75, 1.0), key_energy=900.0, rim_energy=1300.0, top_energy=2500.0, fog_lights=False):
    """Luz principal suave, duas de recorte (uma na cor do herói), preenchimento frio e topo volumétrico.
    Só a luz de topo ilumina a névoa (raios de luz); as outras quase não, para não lavar a imagem."""
    v = 1.0 if fog_lights else 0.08
    area_light('Principal', (3.2, -4.2, 4.2), (0, 0, 1.2), key_energy, (1.0, 0.95, 0.9), 3.0, v)
    area_light('Recorte_heroi', (-3.4, 3.0, 2.6), (0, 0, 1.3), rim_energy, color, 1.6, v)
    area_light('Recorte_frio', (3.6, 2.6, 3.2), (0, 0, 1.4), rim_energy * 0.8, rim2, 1.6, v)
    area_light('Preenchimento', (-4.0, -3.6, 1.2), (0, 0, 1.0), key_energy * 0.18, (0.6, 0.7, 1.0), 4.0, v)
    spot_light('Topo', (0.6, 1.8, 7.5), (0, 0, 0.6), top_energy, (1.0, 0.92, 0.85), 30, 0.8, 0.3, 1.0)


def pedestal(color, glow=2.2, radius=1.45):
    """Pedestal-forja: base em degraus, anel incandescente segmentado, frisos radiais e parafusos."""
    col = kit.collection('Palco')
    M = {
        'base': mats.make('palco_base', (0.045, 0.047, 0.052), 0.75, 0.42, 'metal', detail=0.35),
        'friso': mats.make('palco_friso', (0.012, 0.012, 0.014), 0.3, 0.6, 'rubber'),
        'latao': mats.make('palco_latao', (0.62, 0.42, 0.2), 1.0, 0.3, 'metal', detail=0.5),
        'brilho': mats.make('palco_brilho', (0.0, 0.0, 0.0), 0.0, 0.5, 'emit', color, glow),
        'chao': mats.make('palco_chao', (0.014, 0.015, 0.018), 0.1, 0.42, 'paint', detail=0.12),
    }
    order = ['base', 'friso', 'latao', 'brilho', 'chao']
    idx = {k: i for i, k in enumerate(order)}
    R = radius
    c = geo.lathe([(0.0, 0.0), (R + 0.12, 0.0), (R + 0.12, 0.06), (R + 0.04, 0.1), (R, 0.1), (R, 0.16),
                   (R - 0.08, 0.2), (0.0, 0.2)], 96, m=idx['base'])
    pieces = [c]
    # anel incandescente segmentado
    for k in range(16):
        a0 = tau * k / 16 + 0.03
        a1 = tau * (k + 1) / 16 - 0.03
        th = np.linspace(a0, a1, 10)
        r0, r1 = R - 0.22, R - 0.16
        inner = np.stack([np.cos(th) * r0, np.sin(th) * r0], 1)
        outer = np.stack([np.cos(th) * r1, np.sin(th) * r1], 1)
        poly = np.concatenate([inner, outer[::-1]])
        pieces.append(geo.extrude(poly, 0.012, (0, 0, 0.2), (1, 0, 0), (0, 1, 0), idx['brilho']))
    # frisos radiais e placas de latão
    for k in range(12):
        a = tau * k / 12 + tau / 24
        d = np.array((cos(a), sin(a), 0.0))
        Rz = geo.rot((0, 0, 1), a)
        pieces.append(geo.box(d * (R - 0.55) + (0, 0, 0.2), (0.5, 0.025, 0.02), Rz, idx['friso']))
        pieces.append(geo.box(d * (R + 0.05) + (0, 0, 0.11), (0.08, 0.14, 0.03), Rz, idx['latao']))
    # parafusos na borda
    bolts = geo.Cage()
    for k in range(48):
        a = tau * k / 48
        bolts.merge(geo.bolt((cos(a) * (R - 0.05), sin(a) * (R - 0.05), 0.2), (0, 0, 1), 0.016, 0.01, 6, idx['latao']))
    # disco central com gravação
    pieces.append(geo.lathe([(0.0, 0.2), (0.5, 0.2), (0.52, 0.205), (0.52, 0.21), (0.0, 0.21)], 64, m=idx['latao']))
    for k in range(6):
        a = tau * k / 6
        pieces.append(geo.box((cos(a) * 0.36, sin(a) * 0.36, 0.212), (0.18, 0.02, 0.008), geo.rot((0, 0, 1), a), idx['brilho']))
    objs = []
    for i, p in enumerate(pieces + [bolts]):
        me = kit.cage_to_mesh(p, f'palco{i}')
        for k in order:
            me.materials.append(M[k])
        ob = bpy.data.objects.new(f'Palco{i}', me)
        col.objects.link(ob)
        if i == 0:
            md = ob.modifiers.new('Chanfro', 'BEVEL')
            md.width = 0.012
            md.segments = 3
            md.limit_method = 'ANGLE'
        objs.append(ob)
    # chão escuro e reflexivo
    floor = geo.lathe([(0.0, -0.001), (40.0, -0.001)], 64, caps=False, m=idx['chao'])
    floor.face(list(range(64, 128)), idx['chao'])
    me = kit.cage_to_mesh(floor, 'chao')
    for k in order:
        me.materials.append(M[k])
    ob = bpy.data.objects.new('Chao', me)
    col.objects.link(ob)
    return 0.2


def halo(color, center=(0, 3.2, 2.0), r=2.4, strength=4.0, spokes=36, motif=None):
    """Auréola ao fundo (fica desfocada pela profundidade de campo): anel + raios curtos."""
    col = kit.collection('Palco')
    m, _, _ = mats.emission_only('halo_' + str(color), color, strength)
    c = geo.torus(center, (0, 1, 0), r, 0.025, 160, 10, 0)
    c.merge(geo.torus(center, (0, 1, 0), r * 0.82, 0.012, 140, 8, 0))
    yv = np.array((0.0, 1.0, 0.0))
    for k in range(spokes):
        a = tau * k / spokes
        d = np.array((cos(a), 0.0, sin(a)))
        t = np.cross(yv, d)
        L = 0.22 if k % 3 == 0 else 0.1
        Rk = np.stack([t, yv, d], axis=1)
        c.merge(geo.box(np.asarray(center, float) + d * (r * 0.9), (0.02, 0.01, L), Rk, 0))
    me = kit.cage_to_mesh(c, 'halo')
    me.materials.append(m)
    ob = bpy.data.objects.new('Halo', me)
    col.objects.link(ob)
    return ob


def render(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if cycles() and CYCLES.get('exr'):
        # cópia linear (sem transformação de cor) para ajustar exposição/cor depois sem renderizar de novo
        st = sc.render.image_settings
        old = (st.file_format, st.color_mode, st.color_depth)
        st.file_format = 'OPEN_EXR'
        st.color_mode = 'RGB'
        st.color_depth = '16'
        bpy.data.images['Render Result'].save_render(path.rsplit('.', 1)[0] + '.exr', scene=sc)
        st.file_format, st.color_mode, st.color_depth = old
