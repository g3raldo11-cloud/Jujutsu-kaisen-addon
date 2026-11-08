class_name LMath
extends RefCounted
## Utilidades matemáticas da simulação (equivalentes às do núcleo C#).

const DEG := PI / 180.0

## Perpendicular (−y, x), igual ao Vec2.Perpendicular do núcleo C#.
static func perp(v: Vector2) -> Vector2:
    return Vector2(-v.y, v.x)

## Ângulo sem sinal entre dois vetores (0..PI).
static func angle_between(a: Vector2, b: Vector2) -> float:
    var la := a.length()
    var lb := b.length()
    if la < 1e-5 or lb < 1e-5:
        return 0.0
    return acos(clampf(a.dot(b) / (la * lb), -1.0, 1.0))

static func dist_to_segment(p: Vector2, a: Vector2, b: Vector2) -> float:
    var ab := b - a
    var l2 := ab.length_squared()
    if l2 < 1e-6:
        return p.distance_to(a)
    var t := clampf((p - a).dot(ab) / l2, 0.0, 1.0)
    return p.distance_to(a + ab * t)

static func from_angle(a: float) -> Vector2:
    return Vector2(cos(a), sin(a))

## Converte o plano da simulação (x, y) para o mundo 3D (x, altura, y).
static func to_world(v: Vector2, h: float = 0.0) -> Vector3:
    return Vector3(v.x, h, v.y)

static func to_sim(v: Vector3) -> Vector2:
    return Vector2(v.x, v.z)

## Rotação Y para um modelo construído olhando para +Z encarar a direção dada.
static func facing_yaw(f: Vector2) -> float:
    return atan2(f.x, f.y)
