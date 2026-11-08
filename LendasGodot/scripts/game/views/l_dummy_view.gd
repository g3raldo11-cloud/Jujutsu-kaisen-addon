class_name LDummyView
extends LUnitView
## Boneco de treino: poste de madeira, corpo de palha e alvo pintado. Balança ao apanhar.

var _pivot: Node3D
var _wobble := 0.0
var _wobble_vel := 0.0
var _seen_hit := -10.0

func head_height() -> float:
    return 2.1

func _build() -> void:
    var wood := LMat.lit(Color(0.4, 0.26, 0.13), 0.8)
    var straw := LMat.lit(Color(0.86, 0.72, 0.38), 0.95)
    var red := LMat.lit(Color(0.75, 0.1, 0.08), 0.7)
    var white := LMat.lit(Color(0.95, 0.92, 0.85), 0.7)
    LMat.part(model, LMat.cylinder(0.45, 0.5, 0.1), Vector3(0, 0.05, 0), wood)
    _pivot = Node3D.new()
    _pivot.position = Vector3(0, 0.1, 0)
    model.add_child(_pivot)
    LMat.part(_pivot, LMat.cylinder(0.06, 0.06, 1.6), Vector3(0, 0.8, 0), wood)
    LMat.part(_pivot, LMat.cylinder(0.04, 0.04, 1.2), Vector3(0, 1.45, 0), wood, Vector3.ONE, Vector3(0, 0, 90))
    LMat.part(_pivot, LMat.capsule(0.3, 0.9), Vector3(0, 1.2, 0), straw, Vector3(1, 1, 0.75), Vector3.ZERO, "Corpo de palha")
    LMat.part(_pivot, LMat.sphere(0.21), Vector3(0, 1.9, 0), straw)
    # Alvo pintado no peito.
    LMat.part(_pivot, LMat.cylinder(0.18, 0.18, 0.01, 28), Vector3(0, 1.25, 0.23), red, Vector3.ONE, Vector3(90, 0, 0))
    LMat.part(_pivot, LMat.cylinder(0.12, 0.12, 0.01, 28), Vector3(0, 1.25, 0.24), white, Vector3.ONE, Vector3(90, 0, 0))
    LMat.part(_pivot, LMat.cylinder(0.055, 0.055, 0.01, 20), Vector3(0, 1.25, 0.25), red, Vector3.ONE, Vector3(90, 0, 0))

func sync_view(dt: float) -> void:
    super.sync_view(dt)
    if last_hit > _seen_hit:
        _seen_hit = last_hit
        _wobble_vel += 220.0
    # Mola amortecida: balança e volta ao centro.
    _wobble_vel += (-_wobble * 60.0 - _wobble_vel * 6.0) * dt
    _wobble += _wobble_vel * dt
    _pivot.rotation_degrees.x = -clampf(_wobble, -35.0, 35.0)
