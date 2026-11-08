"""Materiais PBR (Principled BSDF) com microdetalhe procedural para os renders do Blender.

Cada material guarda os valores "planos" em propriedades personalizadas (gltf_*). Antes de exportar
o .glb, ``simplify_for_export`` troca a árvore de nós por um Principled simples com esses valores,
que é o que o glTF (Godot, three.js) entende: cor base, metálico, rugosidade e emissão.
"""
import bpy


def _principled(nt):
    return nt.nodes.get('Principled BSDF') or nt.nodes.new('ShaderNodeBsdfPrincipled')


def _set(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def make(name, base, metal=0.0, rough=0.5, kind='metal', emis=None, strength=0.0, coat=0.0, detail=1.0):
    """kind: 'metal' (escovado), 'paint' (pintura com verniz), 'rubber' (tecido técnico),
    'emit' (incandescente), 'glass' (lente)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bs.outputs[0], out.inputs['Surface'])
    rgba = (*base, 1.0)
    _set(bs, 'Base Color', rgba)
    _set(bs, 'Metallic', metal)
    _set(bs, 'Roughness', rough)
    m['gltf_base'] = list(base)
    m['gltf_metal'] = metal
    m['gltf_rough'] = rough
    m['gltf_emis'] = list(emis) if emis else [0.0, 0.0, 0.0]
    m['gltf_strength'] = strength
    m.diffuse_color = rgba
    m.use_backface_culling = True
    m.metallic = metal
    m.roughness = rough

    tc = nt.nodes.new('ShaderNodeTexCoord')
    if kind in ('metal', 'paint'):
        # variação de rugosidade (manchas e riscos finos) + micro-relevo
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 18.0
        nz.inputs['Detail'].default_value = 6.0
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeMapRange')
        ramp.inputs['From Min'].default_value = 0.35
        ramp.inputs['From Max'].default_value = 0.65
        ramp.inputs['To Min'].default_value = max(0.04, rough - 0.12 * detail)
        ramp.inputs['To Max'].default_value = min(1.0, rough + 0.14 * detail)
        nt.links.new(nz.outputs['Fac'], ramp.inputs['Value'])
        nt.links.new(ramp.outputs['Result'], bs.inputs['Roughness'])
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1.0, 1.0, 60.0) if kind == 'metal' else (1, 1, 1)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        sc = nt.nodes.new('ShaderNodeTexNoise')
        sc.inputs['Scale'].default_value = 90.0 if kind == 'metal' else 140.0
        sc.inputs['Detail'].default_value = 2.0
        nt.links.new(mp.outputs['Vector'], sc.inputs['Vector'])
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.06 * detail
        bump.inputs['Distance'].default_value = 0.002
        nt.links.new(sc.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
        # leve variação de tom
        mix = nt.nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Fac'].default_value = 0.25 * detail
        mix.inputs['Color1'].default_value = rgba
        nt.links.new(nz.outputs['Color'], mix.inputs['Color2'])
        nt.links.new(mix.outputs['Color'], bs.inputs['Base Color'])
        if coat > 0:
            _set(bs, 'Coat Weight', coat)
            _set(bs, 'Coat Roughness', 0.08)
    elif kind == 'rubber':
        vo = nt.nodes.new('ShaderNodeTexVoronoi')
        vo.inputs['Scale'].default_value = 420.0
        nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.12 * detail
        bump.inputs['Distance'].default_value = 0.001
        nt.links.new(vo.outputs['Distance'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
        _set(bs, 'Sheen Weight', 0.05)
    elif kind == 'emit':
        # brasa: tons variando entre a cor dada e uma mais clara/quente
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 26.0
        nz.inputs['Detail'].default_value = 4.0
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        cr = nt.nodes.new('ShaderNodeValToRGB')
        cr.color_ramp.elements[0].position = 0.3
        cr.color_ramp.elements[0].color = (emis[0] * 0.7, emis[1] * 0.45, emis[2] * 0.3, 1.0)
        cr.color_ramp.elements[1].position = 0.75
        mx = max(emis)
        hot = [min(1.0, c * 1.6 + 0.08 * mx) if c < mx else c for c in emis]
        cr.color_ramp.elements[1].color = (*hot, 1.0)
        nt.links.new(nz.outputs['Fac'], cr.inputs['Fac'])
        nt.links.new(cr.outputs['Color'], bs.inputs['Emission Color'])
        _set(bs, 'Emission Strength', strength)
    elif kind == 'glass':
        _set(bs, 'Coat Weight', 1.0)
        _set(bs, 'Coat Roughness', 0.02)
    if emis and kind != 'emit':
        _set(bs, 'Emission Color', (*emis, 1.0))
        _set(bs, 'Emission Strength', strength)
    return m


def simplify_for_export(materials):
    """Troca os nós por um Principled simples (o que o glTF exporta)."""
    for m in materials:
        if m is None or 'gltf_base' not in m:
            continue
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bs.outputs[0], out.inputs['Surface'])
        _set(bs, 'Base Color', (*m['gltf_base'], 1.0))
        _set(bs, 'Metallic', float(m['gltf_metal']))
        _set(bs, 'Roughness', float(m['gltf_rough']))
        e = list(m['gltf_emis'])
        if float(m['gltf_strength']) > 0 and max(e) > 0:
            _set(bs, 'Emission Color', (*e, 1.0))
            _set(bs, 'Emission Strength', float(m['gltf_strength']))
        m.blend_method = 'OPAQUE'


def emission_only(name, color, strength, alpha_noise=False, blend='HASHED'):
    """Material só de emissão (efeitos): cor e força; opcionalmente com borda esfiapada (alpha)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1.0)
    em.inputs['Strength'].default_value = strength
    if alpha_noise:
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
        m.blend_method = blend
        m.shadow_method = 'NONE'
        m['mix'] = True
        return m, nt, mix
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    m.shadow_method = 'NONE'
    return m, nt, None
