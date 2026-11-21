--!strict
-- Todos os efeitos visuais: projéteis, explosões, Territórios, raios,
-- avisos de ataque dos chefes, números de dano, tremor de câmera.
-- O servidor manda "o que aconteceu"; aqui só desenhamos (peças locais).

local Debris = game:GetService("Debris")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared:WaitForChild("Net"))
local Arena = require(Shared:WaitForChild("Util"):WaitForChild("Arena"))

local ClientUtil = script.Parent.Parent:WaitForChild("Util")
local Ui = require(ClientUtil:WaitForChild("Ui"))
local Sfx = require(ClientUtil:WaitForChild("Sfx"))
local ClientState = require(ClientUtil:WaitForChild("ClientState"))

local player = Players.LocalPlayer

local FxController = {}

type Moving = {
	part: BasePart,
	origin: Vector3,
	direction: Vector3,
	speed: number,
	maxDistance: number,
	startedAt: number,
	spin: boolean,
}

local folder: Folder
local overlay: ScreenGui
local hurtFrame: Frame
local projectiles: { [string]: Moving } = {}
local orbiters: { { part: BasePart, center: Vector3, radius: number, height: number, speed: number, offset: number, endsAt: number } } =
	{}

local shakeIntensity = 0
local shakeUntil = 0

----------------------------------------------------------------------------
-- Ajudantes
----------------------------------------------------------------------------

local function newPart(size: Vector3, cframe: CFrame, color: Color3, material: Enum.Material?, shape: Enum.PartType?): Part
	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = material or Enum.Material.Neon
	if shape then
		part.Shape = shape
	end
	part.Parent = folder
	return part
end

local function fadeOut(part: BasePart, time: number, extra: { [string]: any }?)
	local goal: { [string]: any } = { Transparency = 1 }
	if extra then
		for key, value in extra do
			goal[key] = value
		end
	end
	TweenService:Create(part, TweenInfo.new(time, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), goal):Play()
	Debris:AddItem(part, time + 0.05)
end

-- Disco deitado (cilindro do Roblox "deita" no eixo X).
local function flatDiskCFrame(position: Vector3): CFrame
	return CFrame.new(position) * CFrame.Angles(0, 0, math.rad(90))
end

local function groundAt(position: Vector3): number
	return Arena.groundHeight(position)
end

local function distanceToMe(position: Vector3): number
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return (root.Position - position).Magnitude
	end
	return math.huge
end

function FxController.shake(intensity: number, duration: number)
	shakeIntensity = math.max(shakeIntensity, intensity)
	shakeUntil = math.max(shakeUntil, os.clock() + duration)
end

local function shakeNear(position: Vector3, intensity: number, radius: number, duration: number)
	local distance = distanceToMe(position)
	if distance < radius then
		FxController.shake(intensity * (1 - distance / radius), duration)
	end
end

local function ring(position: Vector3, fromDiameter: number, toDiameter: number, color: Color3, time: number, transparency: number?)
	local part = newPart(Vector3.new(0.3, fromDiameter, fromDiameter), flatDiskCFrame(position), color, Enum.Material.Neon, Enum.PartType.Cylinder)
	part.Transparency = transparency or 0.2
	fadeOut(part, time, { Size = Vector3.new(0.3, toDiameter, toDiameter) })
end

local function sphere(position: Vector3, fromDiameter: number, toDiameter: number, color: Color3, time: number, material: Enum.Material?, transparency: number?)
	local part = newPart(Vector3.one * fromDiameter, CFrame.new(position), color, material or Enum.Material.Neon, Enum.PartType.Ball)
	part.Transparency = transparency or 0.3
	fadeOut(part, time, { Size = Vector3.one * toDiameter })
end

local function sparks(position: Vector3, color: Color3, count: number, speed: number, size: number)
	for _ = 1, count do
		local direction = Vector3.new(math.random() - 0.5, math.random() * 0.8, math.random() - 0.5)
		if direction.Magnitude < 0.05 then
			direction = Vector3.yAxis
		end
		direction = direction.Unit
		local part = newPart(Vector3.one * size, CFrame.new(position), color)
		local goal = CFrame.new(position + direction * speed * (0.6 + math.random() * 0.6))
			* CFrame.Angles(math.random() * 6, math.random() * 6, math.random() * 6)
		fadeOut(part, 0.45 + math.random() * 0.25, { CFrame = goal, Size = Vector3.one * size * 0.2 })
	end
end

local function lightning(from: Vector3, to: Vector3, color: Color3, segments: number, jitter: number, time: number)
	local previous = from
	for i = 1, segments do
		local t = i / segments
		local point = from:Lerp(to, t)
		if i < segments then
			point += Vector3.new((math.random() - 0.5) * jitter, (math.random() - 0.5) * jitter, (math.random() - 0.5) * jitter)
		end
		local length = (point - previous).Magnitude
		if length > 0.05 then
			local part = newPart(Vector3.new(0.35, 0.35, length), CFrame.lookAt(previous:Lerp(point, 0.5), point), color)
			fadeOut(part, time)
		end
		previous = point
	end
end

local function addTrail(part: BasePart, color: Color3, color2: Color3, width: number)
	local a0 = Instance.new("Attachment")
	a0.Position = Vector3.new(0, width / 2, 0)
	a0.Parent = part
	local a1 = Instance.new("Attachment")
	a1.Position = Vector3.new(0, -width / 2, 0)
	a1.Parent = part
	local trail = Instance.new("Trail")
	trail.Attachment0 = a0
	trail.Attachment1 = a1
	trail.Color = ColorSequence.new(color, color2)
	trail.Transparency = NumberSequence.new(0.1, 1)
	trail.Lifetime = 0.25
	trail.LightEmission = 1
	trail.FaceCamera = true
	trail.Parent = part
end

local function floatingText(position: Vector3, text: string, color: Color3, size: number, rise: number)
	local anchor = newPart(Vector3.one * 0.2, CFrame.new(position + Vector3.new((math.random() - 0.5) * 2, 0, (math.random() - 0.5) * 2)), color)
	anchor.Transparency = 1
	local billboard = Instance.new("BillboardGui")
	billboard.Size = UDim2.fromOffset(Ui.s(140), Ui.s(50))
	billboard.AlwaysOnTop = true
	billboard.LightInfluence = 0
	billboard.MaxDistance = 200
	billboard.Adornee = anchor
	billboard.StudsOffset = Vector3.zero
	billboard.Parent = anchor
	local label = Ui.label({
		Size = UDim2.fromScale(1, 1),
		Text = text,
		TextColor3 = color,
		TextSize = Ui.s(size),
		Font = Ui.FONT_HEAVY,
		Parent = billboard,
	})
	Ui.textStroke(0.1).Parent = label
	TweenService:Create(billboard, TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		StudsOffset = Vector3.new(0, rise, 0),
	}):Play()
	task.delay(0.45, function()
		TweenService:Create(label, TweenInfo.new(0.35), { TextTransparency = 1 }):Play()
		local stroke = label:FindFirstChildOfClass("UIStroke")
		if stroke then
			TweenService:Create(stroke, TweenInfo.new(0.35), { Transparency = 1 }):Play()
		end
	end)
	Debris:AddItem(anchor, 0.85)
end

local function colorFlash(tint: Color3, time: number)
	local effect = Instance.new("ColorCorrectionEffect")
	effect.TintColor = tint
	effect.Brightness = 0.08
	effect.Saturation = 0.2
	effect.Parent = Lighting
	TweenService:Create(effect, TweenInfo.new(time), {
		TintColor = Color3.new(1, 1, 1),
		Brightness = 0,
		Saturation = 0,
	}):Play()
	Debris:AddItem(effect, time + 0.1)
end

----------------------------------------------------------------------------
-- Formatos dos projéteis por técnica
----------------------------------------------------------------------------

local SPEAR_TECHS = { gelo = true, sol = true, trovao = true }

local function createProjectile(data: { [string]: any }): BasePart
	local radius: number = data.radius or 3
	local color: Color3 = data.color
	local color2: Color3 = data.color2 or color
	local direction: Vector3 = data.direction
	local origin: Vector3 = data.origin
	local visual = math.clamp(radius * 0.55, 1, 4.5)
	local part: BasePart
	if data.tech == "vento" then
		part = newPart(Vector3.new(visual * 2.4, 0.35, visual * 0.6), CFrame.lookAt(origin, origin + direction), color)
	elseif SPEAR_TECHS[data.tech] then
		part = newPart(Vector3.new(visual * 0.45, visual * 0.45, visual * 2.6), CFrame.lookAt(origin, origin + direction), color)
	else
		part = newPart(Vector3.one * visual * 1.3, CFrame.new(origin), color, Enum.Material.Neon, Enum.PartType.Ball)
		local core = newPart(Vector3.one * visual * 0.7, CFrame.new(origin), color2, Enum.Material.Neon, Enum.PartType.Ball)
		local weld = Instance.new("WeldConstraint")
		core.Anchored = false
		weld.Part0 = part
		weld.Part1 = core
		weld.Parent = core
		core.Parent = part
	end
	addTrail(part, color, color2, visual)
	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = 10
	light.Brightness = 2
	light.Parent = part
	return part
end

----------------------------------------------------------------------------
-- Tratadores de cada efeito
----------------------------------------------------------------------------

local handlers: { [string]: (data: { [string]: any }) -> () } = {}

handlers.proj = function(data)
	local part = createProjectile(data)
	projectiles["p" .. tostring(data.id)] = {
		part = part,
		origin = data.origin,
		direction = data.direction,
		speed = data.speed,
		maxDistance = data.range,
		startedAt = os.clock(),
		spin = data.tech == "vento",
	}
	Sfx.play("shoot", 0.35, 1 + math.random() * 0.2, data.origin)
end

handlers.projEnd = function(data)
	local key = "p" .. tostring(data.id)
	local moving = projectiles[key]
	if moving then
		projectiles[key] = nil
		moving.part:Destroy()
	end
	local position: Vector3 = data.position
	local radius: number = data.radius or 3
	sphere(position, 1, math.max(4, radius * 1.6), data.color, 0.3)
	sparks(position, data.color, 5, 6, 0.5)
end

handlers.burst = function(data)
	local position: Vector3 = data.position
	local radius: number = data.radius
	local ground = Vector3.new(position.X, groundAt(position) + 0.2, position.Z)
	ring(ground, 2, radius * 2, data.color, 0.45, 0.15)
	ring(ground, 1, radius * 1.5, data.color2, 0.6, 0.4)
	sphere(position, 3, radius * 2, data.color, 0.4, Enum.Material.ForceField, 0.1)
	sparks(position, data.color2, 14, radius * 0.8, 0.8)
	if data.tech == "trovao" then
		for _ = 1, 5 do
			local angle = math.random() * math.pi * 2
			local target = ground + Vector3.new(math.cos(angle), 0, math.sin(angle)) * radius * math.random()
			lightning(target + Vector3.new(0, 30, 0), target, data.color, 7, 3, 0.3)
		end
	end
	shakeNear(position, 0.6, 40, 0.25)
	Sfx.play("boom", 0.5, 0.9, position)
end

handlers.dash = function(data)
	local from: Vector3 = data.from
	local to: Vector3 = data.to
	local length = (to - from).Magnitude
	if length < 0.5 then
		return
	end
	local beam = newPart(Vector3.new(2.2, 2.2, length), CFrame.lookAt(from:Lerp(to, 0.5), to), data.color)
	beam.Transparency = 0.3
	fadeOut(beam, 0.4, { Size = Vector3.new(0.2, 0.2, length) })
	for i = 1, 4 do
		sphere(from:Lerp(to, i / 4), 1, 5, data.color2, 0.35)
	end
	Sfx.play("slash", 0.5, 1.2, from)
end

handlers.m1 = function(data)
	local position: Vector3 = data.position
	local direction: Vector3 = data.direction
	local finisher = data.finisher == true
	local comboStep: number = data.combo or 1
	local center = position + direction * 4
	local tilt = if comboStep % 2 == 0 then -0.7 else 0.7
	local length = if finisher then 9 else 6
	local slash = newPart(
		Vector3.new(length, 0.25, 0.6),
		CFrame.lookAt(center, center + direction) * CFrame.Angles(0, 0, tilt),
		data.color
	)
	slash.Transparency = 0.1
	fadeOut(slash, 0.18, { Size = Vector3.new(length * 1.3, 0.05, 0.2) })
	if finisher then
		ring(Vector3.new(center.X, groundAt(center) + 0.2, center.Z), 2, 12, data.color, 0.35, 0.2)
		sparks(center, data.color, 6, 6, 0.5)
		shakeNear(position, 0.35, 15, 0.15)
	end
	Sfx.play("slash", 0.35, if finisher then 0.8 else 1 + comboStep * 0.08, position)
end

handlers.chain = function(data)
	lightning(data.from, data.to, data.color, 6, 2.5, 0.25)
end

handlers.domain = function(data)
	local center: Vector3 = data.position
	local radius: number = data.radius
	local duration: number = data.duration
	local color: Color3 = data.color
	local color2: Color3 = data.color2
	local ground = Vector3.new(center.X, 0.15, center.Z)

	local dome = newPart(Vector3.one * 4, CFrame.new(ground), color, Enum.Material.ForceField, Enum.PartType.Ball)
	dome.Transparency = 0
	TweenService:Create(dome, TweenInfo.new(0.7, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
		Size = Vector3.one * radius * 2,
	}):Play()

	local floor = newPart(Vector3.new(0.2, 2, 2), flatDiskCFrame(ground), color, Enum.Material.Neon, Enum.PartType.Cylinder)
	floor.Transparency = 0.65
	TweenService:Create(floor, TweenInfo.new(0.6), { Size = Vector3.new(0.2, radius * 2, radius * 2) }):Play()

	local inner = newPart(Vector3.new(0.25, 2, 2), flatDiskCFrame(ground + Vector3.new(0, 0.05, 0)), color2, Enum.Material.Neon, Enum.PartType.Cylinder)
	inner.Transparency = 0.5
	TweenService:Create(inner, TweenInfo.new(duration, Enum.EasingStyle.Linear), { Size = Vector3.new(0.25, radius * 2, radius * 2) }):Play()

	local endsAt = os.clock() + duration
	for i = 1, 6 do
		local orb = newPart(Vector3.one * 2.2, CFrame.new(ground), color2, Enum.Material.Neon, Enum.PartType.Ball)
		local light = Instance.new("PointLight")
		light.Color = color2
		light.Range = 14
		light.Brightness = 2
		light.Parent = orb
		table.insert(orbiters, {
			part = orb,
			center = ground,
			radius = radius * 0.7,
			height = 8 + (i % 2) * 4,
			speed = 1.6,
			offset = (i / 6) * math.pi * 2,
			endsAt = endsAt,
		})
	end

	colorFlash(color:Lerp(Color3.new(1, 1, 1), 0.35), 1.2)
	shakeNear(center, 1.2, radius * 3, 0.6)
	Sfx.play("boom", 0.8, 0.6, center)

	task.delay(duration, function()
		for _, part in { dome, floor, inner } do
			if part.Parent then
				fadeOut(part, 0.5)
			end
		end
	end)
end

handlers.domainEnd = function(_data) end

handlers.eproj = function(data)
	local origin: Vector3 = data.origin
	local size: number = data.size or 1.2
	local part = newPart(Vector3.one * size * 1.4, CFrame.new(origin), data.color, Enum.Material.Neon, Enum.PartType.Ball)
	addTrail(part, data.color, Color3.new(0, 0, 0), size)
	projectiles["e" .. tostring(data.id)] = {
		part = part,
		origin = origin,
		direction = data.direction,
		speed = data.speed,
		maxDistance = data.speed * data.life,
		startedAt = os.clock(),
		spin = false,
	}
end

handlers.eprojEnd = function(data)
	local key = "e" .. tostring(data.id)
	local moving = projectiles[key]
	if moving then
		projectiles[key] = nil
		local color = moving.part.Color
		moving.part:Destroy()
		if data.hit then
			sphere(data.position, 1, 5, color, 0.25)
		end
	end
end

handlers.telegraph = function(data)
	local position: Vector3 = data.position
	local radius: number = data.radius
	local duration: number = data.duration
	local ground = Vector3.new(position.X, groundAt(position) + 0.2, position.Z)
	local outer = newPart(Vector3.new(0.15, radius * 2, radius * 2), flatDiskCFrame(ground), data.color, Enum.Material.Neon, Enum.PartType.Cylinder)
	outer.Transparency = 0.75
	local inner = newPart(Vector3.new(0.2, 0.5, 0.5), flatDiskCFrame(ground + Vector3.new(0, 0.03, 0)), data.color, Enum.Material.Neon, Enum.PartType.Cylinder)
	inner.Transparency = 0.45
	TweenService:Create(inner, TweenInfo.new(duration, Enum.EasingStyle.Linear), { Size = Vector3.new(0.2, radius * 2, radius * 2) }):Play()
	Debris:AddItem(outer, duration)
	Debris:AddItem(inner, duration)
end

handlers.slam = function(data)
	local position: Vector3 = data.position
	local radius: number = data.radius
	local ground = Vector3.new(position.X, groundAt(position) + 0.3, position.Z)
	ring(ground, 4, radius * 2.2, data.color, 0.5, 0.1)
	sphere(ground, 4, radius * 1.4, Color3.fromRGB(40, 10, 20), 0.5, Enum.Material.SmoothPlastic, 0.3)
	sparks(ground + Vector3.new(0, 1, 0), Color3.fromRGB(90, 80, 90), 16, radius * 0.7, 1.2)
	shakeNear(position, 2, radius * 4, 0.5)
	Sfx.play("boom", 1, 0.5, position)
end

handlers.chargeLine = function(data)
	local from: Vector3 = data.from
	local to: Vector3 = data.to
	local length = (to - from).Magnitude
	if length < 1 then
		return
	end
	local middle = from:Lerp(to, 0.5)
	local line = newPart(
		Vector3.new(data.width, 0.2, length),
		CFrame.lookAt(Vector3.new(middle.X, groundAt(middle) + 0.25, middle.Z), Vector3.new(to.X, groundAt(middle) + 0.25, to.Z)),
		Color3.fromRGB(255, 50, 60)
	)
	line.Transparency = 0.6
	TweenService:Create(line, TweenInfo.new(0.15, Enum.EasingStyle.Linear, Enum.EasingDirection.InOut, -1, true), { Transparency = 0.25 }):Play()
	Debris:AddItem(line, data.duration)
end

handlers.summon = function(data)
	local position: Vector3 = data.position
	local ground = Vector3.new(position.X, groundAt(position) + 0.2, position.Z)
	ring(ground, 4, data.size * 4, data.color, 0.7, 0.2)
	sphere(position, data.size, data.size * 2, data.color, 0.5, Enum.Material.ForceField, 0)
end

handlers.roar = function(data)
	ring(data.position, data.size, data.size * 5, data.color, 0.6, 0.3)
	shakeNear(data.position, 0.8, 80, 0.5)
end

handlers.death = function(data)
	local position: Vector3 = data.position
	local size: number = data.size
	sphere(position, size * 0.8, size * 2, data.color, 0.35)
	for _ = 1, if data.boss then 24 else 7 do
		local chunk = Instance.new("Part")
		chunk.Size = Vector3.one * size * (0.15 + math.random() * 0.2)
		chunk.Color = data.bodyColor
		chunk.Material = Enum.Material.SmoothPlastic
		chunk.CanCollide = true
		chunk.CanQuery = false
		chunk.CanTouch = false
		chunk.CastShadow = false
		chunk.CFrame = CFrame.new(position + Vector3.new(math.random() - 0.5, math.random() - 0.5, math.random() - 0.5) * size * 0.5)
		chunk.CollisionGroup = "Default"
		chunk.Parent = folder
		chunk.AssemblyLinearVelocity = Vector3.new((math.random() - 0.5) * 40, 20 + math.random() * 25, (math.random() - 0.5) * 40)
		fadeOut(chunk, 1.4)
	end
	if data.boss then
		colorFlash(Color3.fromRGB(255, 230, 180), 1.5)
		shakeNear(position, 2.5, 200, 1)
		Sfx.play("boom", 1, 0.4, position)
	else
		Sfx.play("hit", 0.3, 0.7, position)
	end
end

handlers.spawn = function(data)
	local position: Vector3 = data.position
	local size: number = data.size
	local ground = Vector3.new(position.X, groundAt(position) + 0.2, position.Z)
	local column = newPart(Vector3.new(size * 1.4, 18, size * 1.4), CFrame.new(ground + Vector3.new(0, 9, 0)), data.color)
	column.Transparency = 0.5
	fadeOut(column, 0.6, { Size = Vector3.new(0.2, 26, 0.2) })
	ring(ground, 1, size * 3, data.color, 0.5, 0.3)
end

handlers.enemyAttack = function(data)
	local position: Vector3 = data.position
	sphere(position, 1, data.size * 0.9, data.color, 0.2)
end

handlers.dmg = function(data)
	local crit = data.crit == true
	local text = Ui.formatNumber(data.amount) .. (if crit then "!" else "")
	floatingText(data.position, text, data.color, if crit then 30 else 22, 4)
end

handlers.heal = function(data)
	floatingText(data.position + Vector3.new(0, 3, 0), "+" .. Ui.formatNumber(data.amount), Ui.GOOD, 20, 3)
	sparks(data.position, Ui.GOOD, 4, 4, 0.4)
end

handlers.hurt = function(data)
	local amount: number = data.amount or 10
	hurtFrame.BackgroundTransparency = math.clamp(0.9 - amount / 60, 0.55, 0.85)
	TweenService:Create(hurtFrame, TweenInfo.new(0.4), { BackgroundTransparency = 1 }):Play()
	FxController.shake(math.clamp(amount / 25, 0.2, 1), 0.2)
	Sfx.play("hurt", 0.3, 1)
end

handlers.sealHit = function(_data)
	local arena = Workspace:FindFirstChild("Arena")
	local temple = arena and arena:FindFirstChild("Templo")
	local crystal = temple and temple:FindFirstChild("SeloSagrado")
	if crystal and crystal:IsA("BasePart") then
		sphere(crystal.Position, 5, 14, Color3.fromRGB(255, 60, 80), 0.35, Enum.Material.ForceField, 0)
	end
	ClientState.Notify:Fire("O SELO ESTÁ SOB ATAQUE!", Color3.fromRGB(255, 90, 110))
end

handlers.sealHeal = function(data)
	sphere(data.position, 4, 18, Ui.GOOD, 0.6, Enum.Material.ForceField, 0)
	sparks(data.position, Ui.GOOD, 12, 8, 0.6)
end

handlers.clear = function(_data)
	for key, moving in projectiles do
		moving.part:Destroy()
		projectiles[key] = nil
	end
end

----------------------------------------------------------------------------
-- Atualização por frame
----------------------------------------------------------------------------

local function onRender()
	local now = os.clock()

	for key, moving in projectiles do
		local traveled = moving.speed * (now - moving.startedAt)
		if traveled > moving.maxDistance + 4 or not moving.part.Parent then
			projectiles[key] = nil
			if moving.part.Parent then
				moving.part:Destroy()
			end
		else
			local position = moving.origin + moving.direction * traveled
			local look = CFrame.lookAt(position, position + moving.direction)
			if moving.spin then
				look *= CFrame.Angles(0, 0, now * 20)
			end
			moving.part.CFrame = look
		end
	end

	for index = #orbiters, 1, -1 do
		local orb = orbiters[index]
		if now >= orb.endsAt then
			fadeOut(orb.part, 0.4)
			table.remove(orbiters, index)
		else
			local angle = orb.offset + now * orb.speed
			orb.part.CFrame = CFrame.new(orb.center + Vector3.new(math.cos(angle) * orb.radius, orb.height + math.sin(now * 3 + orb.offset), math.sin(angle) * orb.radius))
		end
	end

	-- Tremor de câmera via CameraOffset do Humanoid.
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		if now < shakeUntil then
			local strength = shakeIntensity * math.clamp((shakeUntil - now) * 4, 0, 1)
			humanoid.CameraOffset = Vector3.new(
				(math.random() - 0.5) * strength,
				(math.random() - 0.5) * strength,
				(math.random() - 0.5) * strength
			)
		elseif humanoid.CameraOffset ~= Vector3.zero then
			humanoid.CameraOffset = Vector3.zero
			shakeIntensity = 0
		end
	end
end

function FxController.init()
	local existing = Workspace:FindFirstChild("FxClient")
	if existing then
		existing:Destroy()
	end
	folder = Instance.new("Folder")
	folder.Name = "FxClient"
	folder.Parent = Workspace

	overlay = Ui.screen("FxOverlay", 50)
	overlay.IgnoreGuiInset = true
	hurtFrame = Ui.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(200, 0, 20),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		Parent = overlay,
	})
end

function FxController.start()
	Net.event("Fx").OnClientEvent:Connect(function(kind: string, data: { [string]: any })
		local handler = handlers[kind]
		if handler and typeof(data) == "table" then
			local ok, err = pcall(handler, data)
			if not ok then
				warn(`[Fx] erro no efeito {kind}: {err}`)
			end
		end
	end)
	RunService.RenderStepped:Connect(onRender)
end

return FxController
