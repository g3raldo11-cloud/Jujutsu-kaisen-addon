class_name LOrgShaders
extends RefCounted
## Shaders dos modelos orgânicos exportados do Blender. O Blender grava dados por vértice no mapa UV
## (u = brasa/borda/posição ao longo da mecha, v = pele queimada); estes shaders transformam isso em
## rachaduras incandescentes, mechas de fogo e bordas de escamas que brilham com o Calor.

const SKIN := """
shader_type spatial;
render_mode cull_back;
uniform vec4 albedo : source_color = vec4(0.045, 0.026, 0.018, 1.0);
uniform float roughness_v = 0.6;
uniform vec3 ember : source_color = vec3(1.0, 0.3, 0.035);
uniform float heat = 0.5;
uniform float ember_energy = 5.0;
void fragment() {
    float b = clamp(UV.x, 0.0, 1.0);
    float c = clamp(UV.y, 0.0, 1.0);
    ALBEDO = mix(albedo.rgb, vec3(0.018, 0.014, 0.013), c);
    ROUGHNESS = mix(roughness_v, 0.9, c);
    float pulse = 0.85 + 0.15 * sin(TIME * 3.0 + b * 10.0);
    EMISSION = ember * pow(b, 1.3) * ember_energy * mix(0.35, 1.5, heat) * pulse;
    RIM = 0.25;
    RIM_TINT = 0.4;
}
"""

const FLAME := """
shader_type spatial;
render_mode cull_disabled;
uniform float heat = 0.5;
void fragment() {
    float s = clamp(UV.x, 0.0, 1.0);
    float f = 0.5 + 0.5 * sin(TIME * 9.0 + s * 14.0);
    vec3 c0 = vec3(0.05, 0.004, 0.002);
    vec3 c1 = vec3(0.6, 0.04, 0.01);
    vec3 c2 = vec3(1.0, 0.32, 0.03);
    vec3 c3 = vec3(1.0, 0.85, 0.4);
    vec3 col = s < 0.3 ? mix(c0, c1, s / 0.3) : (s < 0.62 ? mix(c1, c2, (s - 0.3) / 0.32) : mix(c2, c3, (s - 0.62) / 0.38));
    ALBEDO = col * 0.3;
    EMISSION = col * pow(s, 2.0) * (2.0 + 3.0 * heat) * (0.85 + 0.15 * f);
    ROUGHNESS = 0.5;
}
"""

const SCALES := """
shader_type spatial;
render_mode cull_disabled;
uniform vec4 albedo : source_color = vec4(0.2, 0.12, 0.045, 1.0);
uniform float heat = 0.5;
void fragment() {
    float e = clamp(UV.x, 0.0, 1.0);
    ALBEDO = mix(albedo.rgb, vec3(0.02, 0.012, 0.006), pow(e, 1.6));
    ROUGHNESS = 0.3 + 0.35 * e;
    EMISSION = vec3(1.0, 0.32, 0.04) * pow(e, 6.0) * mix(0.6, 3.0, heat) * (0.85 + 0.15 * sin(TIME * 4.0 + FRAGCOORD.x * 0.01));
}
"""

static var _cache := {}

static func _shader(code: String) -> Shader:
    if not _cache.has(code):
        var sh := Shader.new()
        sh.code = code
        _cache[code] = sh
    return _cache[code]

static func _base_color(m: Material, fallback: Color) -> Color:
    if m is BaseMaterial3D:
        return (m as BaseMaterial3D).albedo_color
    return fallback

static func skin(m: Material) -> ShaderMaterial:
    var sm := ShaderMaterial.new()
    sm.shader = _shader(SKIN)
    sm.set_shader_parameter("albedo", _base_color(m, Color(0.045, 0.026, 0.018)))
    return sm

static func flame(_m: Material) -> ShaderMaterial:
    var sm := ShaderMaterial.new()
    sm.shader = _shader(FLAME)
    return sm

static func scales(m: Material) -> ShaderMaterial:
    var sm := ShaderMaterial.new()
    sm.shader = _shader(SCALES)
    sm.set_shader_parameter("albedo", _base_color(m, Color(0.2, 0.12, 0.045)))
    return sm
