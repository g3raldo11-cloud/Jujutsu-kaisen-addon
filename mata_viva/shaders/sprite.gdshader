shader_type canvas_item;

// Character shader: white hit flash, a rim light on the outline facing the fire,
// a flat tint (burning, rooted) and a pixel dissolve for death.
uniform float flash : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec4 rim_color : source_color = vec4(1.0, 0.62, 0.25, 1.0);
uniform vec2 rim_dir = vec2(1.0, 0.0);
uniform float rim_strength : hint_range(0.0, 1.0) = 0.0;
uniform vec4 tint : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float dissolve : hint_range(0.0, 1.0) = 0.0;
uniform vec4 dissolve_color : source_color = vec4(1.0, 0.75, 0.3, 1.0);

varying vec4 vmod;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void vertex() {
	vmod = COLOR;
}

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	if (c.a > 0.0 && rim_strength > 0.0) {
		vec2 d = normalize(rim_dir) * TEXTURE_PIXEL_SIZE;
		if (texture(TEXTURE, UV + d).a < 0.5) {
			c.rgb = mix(c.rgb, rim_color.rgb, rim_strength);
		}
	}
	c.rgb *= tint.rgb;
	c.rgb = mix(c.rgb, flash_color.rgb, flash);
	if (dissolve > 0.0) {
		vec2 cell = floor(UV / TEXTURE_PIXEL_SIZE);
		float h = hash(cell);
		if (h < dissolve) {
			c.a = 0.0;
		} else if (h < dissolve + 0.08) {
			c.rgb = dissolve_color.rgb;
		}
	}
	COLOR = c * vmod;
}
