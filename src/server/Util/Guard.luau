--!strict
-- Validação de argumentos vindos do cliente. Tudo que chega por remote é
-- tratado como hostil até provar o contrário.

local Guard = {}

local LIMIT = 1e5

function Guard.finiteNumber(value: unknown): boolean
	return typeof(value) == "number" and value == value and value > -LIMIT and value < LIMIT
end

function Guard.integerInRange(value: unknown, min: number, max: number): boolean
	if not Guard.finiteNumber(value) then
		return false
	end
	local n = value :: number
	return n == math.floor(n) and n >= min and n <= max
end

function Guard.vector3(value: unknown): boolean
	if typeof(value) ~= "Vector3" then
		return false
	end
	local v = value :: Vector3
	return Guard.finiteNumber(v.X) and Guard.finiteNumber(v.Y) and Guard.finiteNumber(v.Z)
end

function Guard.shortString(value: unknown, maxLength: number): boolean
	return typeof(value) == "string" and #value > 0 and #value <= maxLength
end

return Guard
