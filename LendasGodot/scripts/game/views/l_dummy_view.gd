class_name LDummyView
extends LUnitView
## Boneco de treino detalhado: base e poste de madeira com veios, corpo de palha com fios soltos,
## amarrações de corda, cabeça de saco de estopa com costuras e olhos em X, alvo pintado.
## Balança ao apanhar.

var _pivot: Node3D
var _wobble := 0.0
var _wobble_vel := 0.0
var _seen_hit := -10.0

func head_height() -> float:
    return 2.2

func model_id() -> String:
    return "boneco"

func _build() -> void:
    var wood := LMat.wood(Vector2(1.0, 3.0))
    var straw := LMat.straw(Vector2(2.0, 4.0))
    var rope := LMat.straw(Vector2(1.0, 12.0))
    var burlap := LMat.cloth(Color(0.72, 0.6, 0.42), 10.0)
    var red := LMat.lit(Color(0.75, 0.1, 0.08), 0.7)
    var white := LMat.lit(Color(0.95, 0.92, 0.85), 0.7)
    var dark := LMat.lit(Color(0.12, 0.08, 0.05), 0.8)

    LMat.part(model, LMesh.loft([[0.0, 0.48, 0.48], [0.08, 0.46, 0.46], [0.12, 0.3, 0.3], [0.16, 0.12, 0.12]], 28, 2), Vector3.ZERO, wood)
    _pivot = Node3D.new()
    _pivot.position = Vector3(0, 0.12, 0)
    model.add_child(_pivot)
    LMat.part(_pivot, LMesh.tube([Vector3(0, 0, 0), Vector3(0, 0.9, 0), Vector3(0, 1.75, 0)], [0.07, 0.065, 0.06], 14, 3, 1.0, Vector3(0, 0, 1), Color.WHITE, Color.WHITE, 0.04, 8.0), Vector3.ZERO, wood)
    LMat.part(_pivot, LMesh.tube([Vector3(-0.6, 1.42, 0), Vector3(0, 1.45, 0), Vector3(0.6, 1.42, 0)], [0.045, 0.05, 0.045], 12, 3), Vector3.ZERO, wood)
    # corpo de palha com volume irregular
    LMat.part(_pivot, LMesh.loft([[0.72, 0.18, 0.15], [0.85, 0.26, 0.2], [1.05, 0.29, 0.22], [1.25, 0.28, 0.21], [1.45, 0.24, 0.18], [1.58, 0.12, 0.1]],
        28, 3, 0.08, 9.0, Color(1, 1, 1), Color(0.92, 0.88, 0.8)), Vector3.ZERO, straw)
    # fios de palha soltos
    var rng := RandomNumberGenerator.new()
    rng.seed = 5
    for k in range(48):
        var a := rng.randf() * TAU
        var y := rng.randf_range(0.75, 1.55)
        var r := 0.25 if y < 1.4 else 0.2
        var root := Vector3(cos(a) * r * 0.95, y, sin(a) * r * 0.75)
        var out := Vector3(cos(a), rng.randf_range(-0.6, 0.3), sin(a)) * rng.randf_range(0.06, 0.14)
        LMat.part(_pivot, LMesh.tube([root, root + out * 0.6, root + out + Vector3(0, -0.02, 0)], [0.006, 0.005, 0.0], 5, 2), Vector3.ZERO, straw)
    # amarrações de corda
    for y in [0.8, 1.32, 1.56]:
        LMat.part(_pivot, LMesh.ring(Vector2(0.21 if y < 1.5 else 0.12, 0.17 if y < 1.5 else 0.1), 0.016, 8, 36, 0.12), Vector3(0, y, 0), rope)
    # tufos de palha nas pontas dos braços
    for side in [-1.0, 1.0]:
        for k in range(7):
            var a := k / 7.0 * TAU
            var base := Vector3(0.6 * side, 1.42, 0)
            LMat.part(_pivot, LMesh.tube([base, base + Vector3(0.12 * side, cos(a) * 0.05, sin(a) * 0.05)], [0.012, 0.0], 5, 2), Vector3.ZERO, straw)
    # cabeça de estopa com costuras e olhos em X
    var head := Node3D.new()
    head.position = Vector3(0, 1.85, 0)
    _pivot.add_child(head)
    LMat.part(head, LMesh.ellipsoid(Vector3(0.21, 0.23, 0.2), 24, 16, 0.05, 6.0), Vector3.ZERO, burlap)
    LMat.part(head, LMesh.tube([Vector3(0, 0.2, -0.12), Vector3(0, 0.24, 0.0), Vector3(0, 0.2, 0.12)], [0.008, 0.008, 0.008], 6, 4), Vector3.ZERO, dark)
    for side in [-1.0, 1.0]:
        for d in [-1.0, 1.0]:
            LMat.part(head, LMesh.tube([Vector3(0.07 * side - 0.025, 0.05 + 0.025 * d, 0.19), Vector3(0.07 * side + 0.025, 0.05 - 0.025 * d, 0.19)], [0.007, 0.007], 6, 2), Vector3.ZERO, dark)
    LMat.part(head, LMesh.tube([Vector3(-0.07, -0.07, 0.18), Vector3(-0.02, -0.08, 0.195), Vector3(0.03, -0.07, 0.19), Vector3(0.07, -0.08, 0.175)], [0.006, 0.006, 0.006, 0.006], 6, 3), Vector3.ZERO, dark)
    # alvo pintado no peito
    LMat.part(_pivot, LMat.cylinder(0.18, 0.18, 0.01, 40), Vector3(0, 1.2, 0.225), red, Vector3.ONE, Vector3(90, 0, 0))
    LMat.part(_pivot, LMat.cylinder(0.12, 0.12, 0.01, 40), Vector3(0, 1.2, 0.232), white, Vector3.ONE, Vector3(90, 0, 0))
    LMat.part(_pivot, LMat.cylinder(0.055, 0.055, 0.01, 28), Vector3(0, 1.2, 0.239), red, Vector3.ONE, Vector3(90, 0, 0))

func sync_view(dt: float) -> void:
    super.sync_view(dt)
    if last_hit > _seen_hit:
        _seen_hit = last_hit
        _wobble_vel += 220.0
    # Mola amortecida: balança e volta ao centro.
    _wobble_vel += (-_wobble * 60.0 - _wobble_vel * 6.0) * dt
    _wobble += _wobble_vel * dt
    _pivot.rotation_degrees.x = -clampf(_wobble, -35.0, 35.0)
