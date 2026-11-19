shader_type canvas_item;
render_mode unshaded;

// Post pass over the world: dusk ambient + dynamic lights with dithered, banded
// (pixel-art) falloff, grading, a dithered vignette and full-screen flashes.
uniform sampler2D screen_tex : hint_screen_texture, filter_nearest;
uniform vec2 screen_size = vec2(640.0, 360.0);
uniform vec3 ambient = vec3(0.62, 0.66, 0.8);
uniform int light_count = 0;
uniform vec4 light_pos[48];
uniform vec4 light_col[48];
uniform float vignette = 0.5;
uniform vec4 flash = vec4(1.0, 1.0, 1.0, 0.0);
uniform vec4 grade = vec4(1.0, 0.3, 0.15, 0.0);
uniform float desaturate = 0.0;

const float BAYER[16] = {0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0};

void fragment() {
	vec2 px = floor(SCREEN_UV * screen_size);
	int bi = int(mod(px.x, 4.0)) + int(mod(px.y, 4.0)) * 4;
	float dither = (BAYER[bi] + 0.5) / 16.0;
	vec3 base = texture(screen_tex, SCREEN_UV).rgb;
	vec3 light = ambient;
	for (int i = 0; i < 48; i++) {
		if (i >= light_count) {
			break;
		}
		vec4 lp = light_pos[i];
		vec2 d = px + 0.5 - lp.xy;
		d.y *= 1.5;
		float r = length(d) / max(lp.z, 1.0);
		if (r < 1.0) {
			float f = 1.0 - r;
			f = f * f * (3.0 - 2.0 * f);
			f = floor(f * 4.0 + dither) / 4.0;
			light += light_col[i].rgb * f * lp.w;
		}
	}
	// soft knee: many overlapping lights brighten, but never blow the sprites out
	light = min(light, vec3(1.0)) + max(light - vec3(1.0), vec3(0.0)) * 0.35;
	light = min(light, vec3(1.45));
	vec3 col = base * light;
	float g = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(col, vec3(g), desaturate);
	col = mix(col, grade.rgb * (g * 1.5 + 0.05), grade.a);
	vec2 uv = SCREEN_UV - 0.5;
	uv.x *= screen_size.x / screen_size.y;
	float v = smoothstep(0.42, 1.1, length(uv) * 1.2);
	v = floor(v * 5.0 + dither) / 5.0;
	col *= 1.0 - v * vignette;
	col = mix(col, flash.rgb, flash.a);
	COLOR = vec4(col, 1.0);
}
