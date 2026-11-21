--!strict
-- Geometria do mapa usada pelos dois lados (servidor e cliente).
-- O templo central tem 3 degraus; as maldições "flutuam" na altura do chão.

local Arena = {}

-- Degraus do templo: metade do lado do quadrado e altura do topo.
Arena.TIERS = {
	{ half = 35, top = 1 },
	{ half = 28, top = 2 },
	{ half = 17, top = 3 },
}

function Arena.groundHeight(position: Vector3): number
	local distance = math.max(math.abs(position.X), math.abs(position.Z))
	local height = 0
	for _, tier in Arena.TIERS do
		if distance <= tier.half then
			height = tier.top
		end
	end
	return height
end

function Arena.flat(vector: Vector3): Vector3
	return Vector3.new(vector.X, 0, vector.Z)
end

-- Distância ignorando a altura (o mundo é praticamente plano).
function Arena.flatDistance(a: Vector3, b: Vector3): number
	local dx = a.X - b.X
	local dz = a.Z - b.Z
	return math.sqrt(dx * dx + dz * dz)
end

-- Distância horizontal de um ponto até um segmento (para investidas).
function Arena.distanceToSegment(point: Vector3, a: Vector3, b: Vector3): number
	local p = Arena.flat(point)
	local fa = Arena.flat(a)
	local fb = Arena.flat(b)
	local ab = fb - fa
	local lengthSq = ab:Dot(ab)
	if lengthSq < 1e-6 then
		return (p - fa).Magnitude
	end
	local t = math.clamp((p - fa):Dot(ab) / lengthSq, 0, 1)
	return (p - (fa + ab * t)).Magnitude
end

return Arena
