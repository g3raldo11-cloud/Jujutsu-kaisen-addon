class_name LMesh
extends RefCounted
## Gerador de malhas procedurais com muitos polígonos.
## Base de tudo: a "varredura" (sweep) — um tubo cuja seção elíptica varia ao longo de um caminho
## suave (Catmull-Rom). Com ela saem troncos, membros com músculos, dedos, mechas de cabelo,
## presas, chifres, o corpo contínuo do Boitatá e tiras de tecido. Normais analíticas, UV ao longo
## do comprimento (para texturas de escamas/fibras) e cores por vértice (degradês).

## Godot usa sentido horário para faces frontais.
const FRONT_CW := true

static var _noise: FastNoiseLite

static func noise() -> FastNoiseLite:
    if _noise == null:
        _noise = FastNoiseLite.new()
        _noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
        _noise.frequency = 1.0
        _noise.seed = 1234
    return _noise

# ------------------------------------------------------------------ curvas

## Curva suave que passa pelos pontos de controle (Catmull-Rom).
static func smooth_points(ctrl: Array, subdiv: int = 4) -> PackedVector3Array:
    var out := PackedVector3Array()
    var n := ctrl.size()
    if n < 2 or subdiv <= 1:
        for p in ctrl:
            out.append(p)
        return out
    for i in range(n - 1):
        var p0: Vector3 = ctrl[maxi(i - 1, 0)]
        var p1: Vector3 = ctrl[i]
        var p2: Vector3 = ctrl[i + 1]
        var p3: Vector3 = ctrl[mini(i + 2, n - 1)]
        for s in range(subdiv):
            out.append(p1.cubic_interpolate(p2, p0, p3, float(s) / subdiv))
    out.append(ctrl[n - 1])
    return out

static func smooth_values(vals: Array, subdiv: int = 4) -> PackedFloat32Array:
    var out := PackedFloat32Array()
    var n := vals.size()
    if n < 2 or subdiv <= 1:
        for v in vals:
            out.append(float(v))
        return out
    for i in range(n - 1):
        var v0 := float(vals[maxi(i - 1, 0)])
        var v1 := float(vals[i])
        var v2 := float(vals[i + 1])
        var v3 := float(vals[mini(i + 2, n - 1)])
        for s in range(subdiv):
            out.append(maxf(0.0, cubic_interpolate(v1, v2, v0, v3, float(s) / subdiv)))
    out.append(float(vals[n - 1]))
    return out

# ------------------------------------------------------------------ varredura

## Arrays de malha de um tubo ao longo de `pts`. Seção elíptica: `rx` (lado) e `ry` (altura,
## orientada por `up`). `cols` dá a cor de cada anel. Ruído opcional desloca a superfície.
static func sweep_arrays(pts: PackedVector3Array, rx: PackedFloat32Array, ry: PackedFloat32Array, sides: int,
        up: Vector3, cols: PackedColorArray, noise_amp: float = 0.0, noise_freq: float = 6.0, caps: bool = true) -> Array:
    var n := pts.size()
    var verts := PackedVector3Array()
    var norms := PackedVector3Array()
    var uvs := PackedVector2Array()
    var colors := PackedColorArray()
    var idx := PackedInt32Array()
    if n < 2:
        return []
    var lengths := PackedFloat32Array()
    lengths.resize(n)
    var total := 0.0
    for i in range(1, n):
        total += pts[i].distance_to(pts[i - 1])
        lengths[i] = total
    if total <= 1e-6:
        total = 1.0
    var nz := noise()
    var normal := Vector3.ZERO
    var tan_prev := Vector3.UP
    var tangents := PackedVector3Array()
    var best_ring := 0
    var best_r := -1.0
    for i in range(n):
        var t := pts[mini(i + 1, n - 1)] - pts[maxi(i - 1, 0)]
        if t.length_squared() < 1e-12:
            t = tan_prev
        t = t.normalized()
        tangents.append(t)
        if i == 0:
            normal = up - t * up.dot(t)
            if normal.length_squared() < 1e-6:
                normal = Vector3.RIGHT - t * Vector3.RIGHT.dot(t)
        else:
            normal = normal - t * normal.dot(t)  # transporte paralelo: sem torção
            if normal.length_squared() < 1e-8:
                normal = up - t * up.dot(t)
        normal = normal.normalized()
        var binormal := t.cross(normal).normalized()
        tan_prev = t
        var c: Color = cols[i] if i < cols.size() else Color.WHITE
        var rxi := rx[i]
        var ryi := ry[i]
        if rxi + ryi > best_r:
            best_r = rxi + ryi
            best_ring = i
        for j in range(sides + 1):
            var a := TAU * float(j) / sides
            var ca := cos(a)
            var sa := sin(a)
            var dir := binormal * (ca * rxi) + normal * (sa * ryi)
            var k := 1.0
            if noise_amp > 0.0:
                k = 1.0 + noise_amp * nz.get_noise_3dv((pts[i] + dir) * noise_freq)
            verts.append(pts[i] + dir * k)
            var nn := binormal * (ca * maxf(ryi, 1e-4)) + normal * (sa * maxf(rxi, 1e-4))
            norms.append(nn.normalized())
            uvs.append(Vector2(float(j) / sides, lengths[i] / total))
            colors.append(c)
    var ring := sides + 1
    var body_start := idx.size()
    for i in range(n - 1):
        for j in range(sides):
            var a0 := i * ring + j
            var a1 := a0 + 1
            var b0 := a0 + ring
            var b1 := b0 + 1
            idx.append(a0)
            idx.append(b0)
            idx.append(a1)
            idx.append(a1)
            idx.append(b0)
            idx.append(b1)
    # Orientação: confere um triângulo do anel mais largo contra a normal de fora.
    var probe := mini(best_ring, n - 2) * sides * 6
    idx = _orient(verts, idx, body_start, idx.size(), probe, norms[idx[probe]])
    if caps:
        for end in [0, n - 1]:
            var r_end := rx[end] + ry[end]
            if r_end < 1e-4:
                continue
            var center := verts.size()
            var tn: Vector3 = -tangents[0] if end == 0 else tangents[n - 1]
            verts.append(pts[end])
            norms.append(tn)
            uvs.append(Vector2(0.5, 0.0 if end == 0 else 1.0))
            colors.append(cols[end] if end < cols.size() else Color.WHITE)
            var cap_start := idx.size()
            for j in range(sides):
                idx.append(center)
                idx.append(end * ring + j)
                idx.append(end * ring + j + 1)
            idx = _orient(verts, idx, cap_start, idx.size(), cap_start, tn)
    var arr := []
    arr.resize(Mesh.ARRAY_MAX)
    arr[Mesh.ARRAY_VERTEX] = verts
    arr[Mesh.ARRAY_NORMAL] = norms
    arr[Mesh.ARRAY_TEX_UV] = uvs
    arr[Mesh.ARRAY_COLOR] = colors
    arr[Mesh.ARRAY_INDEX] = idx
    return arr

## Garante faces frontais apontando para fora (inverte o lote inteiro se preciso).
static func _orient(verts: PackedVector3Array, idx: PackedInt32Array, from: int, to: int, probe: int, outward: Vector3) -> PackedInt32Array:
    var p := probe
    while p + 2 < to:
        var a := verts[idx[p]]
        var b := verts[idx[p + 1]]
        var c := verts[idx[p + 2]]
        var cr := (b - a).cross(c - a)
        if cr.length_squared() > 1e-14:
            var cw_ok := cr.dot(outward) < 0.0
            if cw_ok != FRONT_CW:
                for t in range(from, to, 3):
                    var tmp := idx[t + 1]
                    idx[t + 1] = idx[t + 2]
                    idx[t + 2] = tmp
            break
        p += 3
    return idx

static func to_mesh(arr: Array) -> ArrayMesh:
    var m := ArrayMesh.new()
    if arr.size() > 0:
        m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
    return m

static func _gradient(n: int, a: Color, b: Color) -> PackedColorArray:
    var cols := PackedColorArray()
    for i in range(n):
        cols.append(a.lerp(b, float(i) / maxf(1.0, n - 1)))
    return cols

## Tubo suave por pontos de controle com raios por ponto (membros, dedos, mechas, presas...).
## `flatten` achata a seção (0,1 = lâmina; 1 = redonda). Cores em degradê de `ca` até `cb`.
static func tube(ctrl: Array, radii: Array, sides: int = 14, subdiv: int = 4, flatten: float = 1.0,
        up: Vector3 = Vector3(0, 0, 1), ca: Color = Color.WHITE, cb: Color = Color.WHITE,
        noise_amp: float = 0.0, noise_freq: float = 6.0, caps: bool = true) -> ArrayMesh:
    var pts := smooth_points(ctrl, subdiv)
    var rx := smooth_values(radii, subdiv)
    var ry := PackedFloat32Array()
    for r in rx:
        ry.append(r * flatten)
    return to_mesh(sweep_arrays(pts, rx, ry, sides, up, _gradient(pts.size(), ca, cb), noise_amp, noise_freq, caps))

## Sólido vertical por anéis [y, largura, profundidade, deslocamento_z] (troncos, cabeças, saias).
static func loft(rings: Array, sides: int = 24, subdiv: int = 3, noise_amp: float = 0.0, noise_freq: float = 6.0,
        ca: Color = Color.WHITE, cb: Color = Color.WHITE, caps: bool = true) -> ArrayMesh:
    var ctrl := []
    var wx := []
    var dz := []
    for r in rings:
        ctrl.append(Vector3(0.0, r[0], r[3] if r.size() > 3 else 0.0))
        wx.append(r[1])
        dz.append(r[2])
    var pts := smooth_points(ctrl, subdiv)
    var rx := smooth_values(wx, subdiv)
    var ry := smooth_values(dz, subdiv)
    return to_mesh(sweep_arrays(pts, rx, ry, sides, Vector3(0, 0, 1), _gradient(pts.size(), ca, cb), noise_amp, noise_freq, caps))

## Elipsoide de alta resolução.
static func ellipsoid(r: Vector3, sides: int = 24, rings: int = 14, noise_amp: float = 0.0, noise_freq: float = 6.0,
        ca: Color = Color.WHITE, cb: Color = Color.WHITE) -> ArrayMesh:
    var pts := PackedVector3Array()
    var rx := PackedFloat32Array()
    var ry := PackedFloat32Array()
    for i in range(rings + 1):
        var phi := PI * float(i) / rings - PI * 0.5
        pts.append(Vector3(0.0, sin(phi) * r.y, 0.0))
        rx.append(cos(phi) * r.x)
        ry.append(cos(phi) * r.z)
    return to_mesh(sweep_arrays(pts, rx, ry, sides, Vector3(0, 0, 1), _gradient(pts.size(), ca, cb), noise_amp, noise_freq, false))

## Anel (toro) horizontal: cintos, braçadeiras, tornozeleiras, amarrações de corda.
static func ring(radius: Vector2, thickness: float, sides: int = 8, segs: int = 32, noise_amp: float = 0.0) -> ArrayMesh:
    var pts := PackedVector3Array()
    var rx := PackedFloat32Array()
    var ry := PackedFloat32Array()
    for i in range(segs + 1):
        var a := TAU * float(i) / segs
        pts.append(Vector3(cos(a) * radius.x, 0.0, sin(a) * radius.y))
        rx.append(thickness)
        ry.append(thickness)
    # fecha o laço repetindo os dois primeiros pontos para tangentes contínuas
    return to_mesh(sweep_arrays(pts, rx, ry, sides, Vector3.UP, PackedColorArray(), noise_amp, 30.0, false))

## Conta triângulos de uma árvore de nós (para relatórios de complexidade).
static func count_triangles(root: Node) -> int:
    var total := 0
    if root is MeshInstance3D and (root as MeshInstance3D).mesh != null:
        var m := (root as MeshInstance3D).mesh
        for s in range(m.get_surface_count()):
            var arrs := m.surface_get_arrays(s)
            var ind = arrs[Mesh.ARRAY_INDEX]
            if ind != null and ind.size() > 0:
                total += ind.size() / 3
            else:
                total += (arrs[Mesh.ARRAY_VERTEX] as PackedVector3Array).size() / 3
    for c in root.get_children():
        total += count_triangles(c)
    return total
