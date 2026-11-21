--!strict
-- Constrói o mapa inteiro por código quando o servidor liga:
-- templo com o Selo Sagrado, portões, caminhos, 4 portais das maldições,
-- lanternas, árvores mortas, pedras e a iluminação noturna.
-- Assim o jogo funciona mesmo num lugar (place) vazio.

local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Arena = require(Shared:WaitForChild("Util"):WaitForChild("Arena"))

local MapBuilder = {}

MapBuilder.portals = {} :: { Vector3 }
MapBuilder.sealCrystal = nil :: Part?
MapBuilder.sealLight = nil :: PointLight?

local SEAL_COLOR = Color3.fromRGB(200, 150, 255)
local SEAL_DANGER_COLOR = Color3.fromRGB(255, 50, 70)

local COLORS = {
	ground = Color3.fromRGB(38, 44, 40),
	groundPatch = Color3.fromRGB(48, 40, 52),
	stoneDark = Color3.fromRGB(66, 62, 76),
	stone = Color3.fromRGB(86, 82, 98),
	marble = Color3.fromRGB(196, 190, 206),
	lacquer = Color3.fromRGB(165, 32, 36),
	beamDark = Color3.fromRGB(32, 26, 34),
	path = Color3.fromRGB(70, 68, 78),
	wood = Color3.fromRGB(48, 36, 36),
	rock = Color3.fromRGB(78, 74, 88),
	fire = Color3.fromRGB(255, 150, 60),
	portal = Color3.fromRGB(190, 20, 70),
	portalDark = Color3.fromRGB(25, 12, 22),
}

local function block(
	parent: Instance,
	name: string,
	size: Vector3,
	cframe: CFrame,
	color: Color3,
	material: Enum.Material,
	shape: Enum.PartType?
): Part
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = material
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	if shape then
		part.Shape = shape
	end
	part.Parent = parent
	return part
end

-- Cilindro em pé (no Roblox o cilindro "deita" no eixo X).
local function pillar(parent: Instance, name: string, position: Vector3, height: number, diameter: number, color: Color3, material: Enum.Material): Part
	return block(
		parent,
		name,
		Vector3.new(height, diameter, diameter),
		CFrame.new(position + Vector3.new(0, height / 2, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		color,
		material,
		Enum.PartType.Cylinder
	)
end

local function disk(parent: Instance, name: string, position: Vector3, diameter: number, thickness: number, color: Color3, material: Enum.Material): Part
	return block(
		parent,
		name,
		Vector3.new(thickness, diameter, diameter),
		CFrame.new(position) * CFrame.Angles(0, 0, math.rad(90)),
		color,
		material,
		Enum.PartType.Cylinder
	)
end

local function addLight(part: BasePart, color: Color3, range: number, brightness: number): PointLight
	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = range
	light.Brightness = brightness
	light.Shadows = false
	light.Parent = part
	return light
end

local function setupLighting()
	for _, child in Lighting:GetChildren() do
		if child:IsA("Atmosphere") or child:IsA("PostEffect") or child:IsA("Clouds") then
			child:Destroy()
		end
	end

	Lighting.ClockTime = 0.6
	Lighting.Brightness = 1.6
	Lighting.Ambient = Color3.fromRGB(50, 40, 78)
	Lighting.OutdoorAmbient = Color3.fromRGB(78, 64, 118)
	Lighting.EnvironmentDiffuseScale = 0.4
	Lighting.EnvironmentSpecularScale = 0.6
	Lighting.GlobalShadows = true

	local atmosphere = Instance.new("Atmosphere")
	atmosphere.Density = 0.36
	atmosphere.Offset = 0.15
	atmosphere.Color = Color3.fromRGB(118, 88, 160)
	atmosphere.Decay = Color3.fromRGB(58, 30, 92)
	atmosphere.Glare = 0
	atmosphere.Haze = 1.6
	atmosphere.Parent = Lighting

	local bloom = Instance.new("BloomEffect")
	bloom.Intensity = 0.9
	bloom.Size = 28
	bloom.Threshold = 0.9
	bloom.Parent = Lighting

	local grading = Instance.new("ColorCorrectionEffect")
	grading.Name = "NightGrading"
	grading.Contrast = 0.12
	grading.Saturation = 0.08
	grading.TintColor = Color3.fromRGB(232, 222, 255)
	grading.Parent = Lighting
end

local function buildGround(arena: Instance, rng: Random)
	block(arena, "Chao", Vector3.new(620, 2, 620), CFrame.new(0, -1, 0), COLORS.ground, Enum.Material.Grass)

	for i = 1, 26 do
		local angle = rng:NextNumber(0, math.pi * 2)
		local radius = rng:NextNumber(50, 190)
		local position = Vector3.new(math.cos(angle) * radius, 0.03, math.sin(angle) * radius)
		disk(arena, "Mancha", position, rng:NextNumber(14, 34), 0.06, COLORS.groundPatch, Enum.Material.Ground)
	end

	-- Paredes invisíveis no limite do mapa.
	local limit = Config.ARENA_LIMIT + 15
	for _, data in
		{
			{ Vector3.new(limit * 2 + 4, 80, 2), Vector3.new(0, 40, limit) },
			{ Vector3.new(limit * 2 + 4, 80, 2), Vector3.new(0, 40, -limit) },
			{ Vector3.new(2, 80, limit * 2 + 4), Vector3.new(limit, 40, 0) },
			{ Vector3.new(2, 80, limit * 2 + 4), Vector3.new(-limit, 40, 0) },
		}
	do
		local wall = block(arena, "Limite", data[1], CFrame.new(data[2]), COLORS.ground, Enum.Material.SmoothPlastic)
		wall.Transparency = 1
	end
end

local function buildTemple(arena: Instance)
	local temple = Instance.new("Model")
	temple.Name = "Templo"
	temple.Parent = arena

	local tierColors = { COLORS.stoneDark, COLORS.stone, COLORS.marble }
	local tierMaterials = { Enum.Material.Slate, Enum.Material.Slate, Enum.Material.Marble }
	for index, tier in Arena.TIERS do
		local height = tier.top
		block(
			temple,
			"Degrau" .. index,
			Vector3.new(tier.half * 2, height, tier.half * 2),
			CFrame.new(0, height / 2, 0),
			tierColors[index],
			tierMaterials[index]
		)
	end

	-- Pedestal e cristal do Selo.
	local top = Arena.TIERS[#Arena.TIERS].top
	pillar(temple, "Pedestal", Vector3.new(0, top, 0), 3, 9, COLORS.stoneDark, Enum.Material.Slate)
	disk(temple, "RunaSelo", Vector3.new(0, top + 0.05, 0), 24, 0.1, Color3.fromRGB(150, 90, 230), Enum.Material.Neon).Transparency = 0.55

	local crystal = block(
		temple,
		"SeloSagrado",
		Vector3.new(4.5, 4.5, 4.5),
		CFrame.new(Config.SEAL_POSITION + Vector3.new(0, 3, 0)) * CFrame.Angles(math.rad(45), 0, math.rad(45)),
		SEAL_COLOR,
		Enum.Material.Neon
	)
	crystal.CanCollide = false
	MapBuilder.sealCrystal = crystal
	MapBuilder.sealLight = addLight(crystal, SEAL_COLOR, 40, 3)

	local sparkles = Instance.new("ParticleEmitter")
	sparkles.Color = ColorSequence.new(SEAL_COLOR)
	sparkles.LightEmission = 1
	sparkles.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 0) })
	sparkles.Transparency = NumberSequence.new(0.2)
	sparkles.Lifetime = NumberRange.new(1.2, 2)
	sparkles.Rate = 18
	sparkles.Speed = NumberRange.new(2, 5)
	sparkles.SpreadAngle = Vector2.new(180, 180)
	sparkles.Parent = crystal

	local spin = TweenInfo.new(8, Enum.EasingStyle.Linear, Enum.EasingDirection.InOut, -1)
	TweenService:Create(crystal, spin, { CFrame = crystal.CFrame * CFrame.Angles(0, math.rad(90), 0) }):Play()

	-- Quatro colunas vermelhas e vigas, com lanternas penduradas.
	local columnHeight = 18
	local offset = 14
	for _, sign in { Vector3.new(1, 0, 1), Vector3.new(-1, 0, 1), Vector3.new(1, 0, -1), Vector3.new(-1, 0, -1) } do
		pillar(temple, "Coluna", Vector3.new(sign.X * offset, top, sign.Z * offset), columnHeight, 2.6, COLORS.lacquer, Enum.Material.WoodPlanks)
	end
	local beamY = top + columnHeight
	for _, data in
		{
			{ Vector3.new(offset * 2 + 4, 1.4, 1.4), Vector3.new(0, beamY, offset) },
			{ Vector3.new(offset * 2 + 4, 1.4, 1.4), Vector3.new(0, beamY, -offset) },
			{ Vector3.new(1.4, 1.4, offset * 2 + 4), Vector3.new(offset, beamY, 0) },
			{ Vector3.new(1.4, 1.4, offset * 2 + 4), Vector3.new(-offset, beamY, 0) },
		}
	do
		block(temple, "Viga", data[1], CFrame.new(data[2]), COLORS.beamDark, Enum.Material.Wood)
		local lantern = block(temple, "Lanterna", Vector3.new(1.4, 2, 1.4), CFrame.new(data[2] - Vector3.new(0, 2.4, 0)), COLORS.fire, Enum.Material.Neon)
		lantern.CanCollide = false
		addLight(lantern, COLORS.fire, 16, 1.5)
	end
end

local function buildTorii(arena: Instance, base: CFrame)
	local gate = Instance.new("Model")
	gate.Name = "Portao"
	gate.Parent = arena
	local height = 16
	for _, x in { -7, 7 } do
		local position = (base * CFrame.new(x, 0, 0)).Position
		pillar(gate, "Pilar", position, height, 2.2, COLORS.lacquer, Enum.Material.WoodPlanks)
	end
	block(gate, "Kasagi", Vector3.new(23, 1.6, 2.2), base * CFrame.new(0, height + 0.8, 0), COLORS.beamDark, Enum.Material.Wood)
	block(gate, "Nuki", Vector3.new(18, 1.1, 1.4), base * CFrame.new(0, height - 3, 0), COLORS.lacquer, Enum.Material.WoodPlanks)
end

local function buildStoneLantern(arena: Instance, position: Vector3)
	local lantern = Instance.new("Model")
	lantern.Name = "LanternaDePedra"
	lantern.Parent = arena
	block(lantern, "Base", Vector3.new(2.4, 3, 2.4), CFrame.new(position + Vector3.new(0, 1.5, 0)), COLORS.stone, Enum.Material.Slate)
	local flame = block(lantern, "Chama", Vector3.new(1.6, 1.6, 1.6), CFrame.new(position + Vector3.new(0, 3.8, 0)), COLORS.fire, Enum.Material.Neon)
	block(lantern, "Teto", Vector3.new(3.4, 0.8, 3.4), CFrame.new(position + Vector3.new(0, 5, 0)), COLORS.stoneDark, Enum.Material.Slate)
	addLight(flame, COLORS.fire, 20, 2)
	local fire = Instance.new("Fire")
	fire.Size = 3
	fire.Heat = 4
	fire.Color = COLORS.fire
	fire.SecondaryColor = Color3.fromRGB(255, 60, 30)
	fire.Parent = flame
end

local function buildPortal(arena: Instance, base: CFrame, rng: Random)
	local portal = Instance.new("Model")
	portal.Name = "PortalMaldito"
	portal.Parent = arena

	disk(portal, "Circulo", base.Position + Vector3.new(0, 0.06, 0), 22, 0.12, COLORS.portalDark, Enum.Material.Slate)
	disk(portal, "Runa", base.Position + Vector3.new(0, 0.1, 0), 15, 0.1, COLORS.portal, Enum.Material.Neon).Transparency = 0.4

	local rift = block(portal, "Fenda", Vector3.new(8, 15, 0.8), base * CFrame.new(0, 8.5, 0), COLORS.portal, Enum.Material.Neon)
	rift.Transparency = 0.15
	rift.CanCollide = false
	addLight(rift, COLORS.portal, 30, 3)

	local smoke = Instance.new("ParticleEmitter")
	smoke.Color = ColorSequence.new(Color3.fromRGB(60, 0, 30), Color3.fromRGB(10, 0, 10))
	smoke.LightEmission = 0.3
	smoke.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 2), NumberSequenceKeypoint.new(1, 6) })
	smoke.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.4), NumberSequenceKeypoint.new(1, 1) })
	smoke.Lifetime = NumberRange.new(2, 3.5)
	smoke.Rate = 10
	smoke.Speed = NumberRange.new(1, 3)
	smoke.SpreadAngle = Vector2.new(40, 40)
	smoke.Parent = rift

	-- Pedras em volta do portal.
	for i = 1, 8 do
		local angle = (i / 8) * math.pi * 2
		local position = base.Position + Vector3.new(math.cos(angle) * 12, 1.5, math.sin(angle) * 12)
		local size = Vector3.new(rng:NextNumber(2, 4), rng:NextNumber(3, 7), rng:NextNumber(2, 4))
		block(
			portal,
			"Pedra",
			size,
			CFrame.new(position) * CFrame.Angles(rng:NextNumber(-0.3, 0.3), rng:NextNumber(0, 6), rng:NextNumber(-0.3, 0.3)),
			COLORS.rock,
			Enum.Material.Rock
		)
	end
end

local function insideLane(position: Vector3): boolean
	return math.abs(position.X) < 16 or math.abs(position.Z) < 16
end

local function buildDecoration(arena: Instance, rng: Random)
	local decor = Instance.new("Folder")
	decor.Name = "Decoracao"
	decor.Parent = arena

	local placedTrees = 0
	local attempts = 0
	while placedTrees < 45 and attempts < 400 do
		attempts += 1
		local angle = rng:NextNumber(0, math.pi * 2)
		local radius = rng:NextNumber(52, 195)
		local position = Vector3.new(math.cos(angle) * radius, 0, math.sin(angle) * radius)
		if not insideLane(position) then
			placedTrees += 1
			local tree = Instance.new("Model")
			tree.Name = "ArvoreMorta"
			tree.Parent = decor
			local height = rng:NextNumber(10, 20)
			local trunk = pillar(tree, "Tronco", position, height, rng:NextNumber(1.4, 2.4), COLORS.wood, Enum.Material.Wood)
			trunk.CFrame = trunk.CFrame * CFrame.Angles(rng:NextNumber(-0.06, 0.06), 0, 0)
			for b = 1, rng:NextInteger(2, 4) do
				local branchLength = rng:NextNumber(4, 8)
				local branchY = height * rng:NextNumber(0.5, 0.95)
				local yaw = rng:NextNumber(0, math.pi * 2)
				local tilt = rng:NextNumber(0.5, 1.1)
				local branchCFrame = CFrame.new(position + Vector3.new(0, branchY, 0))
					* CFrame.Angles(0, yaw, 0)
					* CFrame.Angles(tilt, 0, 0)
					* CFrame.new(0, branchLength / 2, 0)
				block(tree, "Galho" .. b, Vector3.new(0.6, branchLength, 0.6), branchCFrame, COLORS.wood, Enum.Material.Wood)
			end
		end
	end

	local placedRocks = 0
	attempts = 0
	while placedRocks < 60 and attempts < 400 do
		attempts += 1
		local angle = rng:NextNumber(0, math.pi * 2)
		local radius = rng:NextNumber(42, 200)
		local position = Vector3.new(math.cos(angle) * radius, 0, math.sin(angle) * radius)
		if not insideLane(position) then
			placedRocks += 1
			local size = Vector3.new(rng:NextNumber(2, 7), rng:NextNumber(1.5, 5), rng:NextNumber(2, 7))
			block(
				decor,
				"Pedra",
				size,
				CFrame.new(position + Vector3.new(0, size.Y * 0.35, 0))
					* CFrame.Angles(rng:NextNumber(-0.4, 0.4), rng:NextNumber(0, 6.28), rng:NextNumber(-0.4, 0.4)),
				COLORS.rock,
				Enum.Material.Rock
			)
		end
	end

	-- Túmulos de pedra perto do templo, para dar clima.
	for i = 1, 16 do
		local angle = (i / 16) * math.pi * 2 + 0.2
		local position = Vector3.new(math.cos(angle) * 58, 0, math.sin(angle) * 58)
		if not insideLane(position) then
			block(
				decor,
				"Lapide",
				Vector3.new(2.6, 4, 0.8),
				CFrame.lookAt(position + Vector3.new(0, 2, 0), Vector3.new(0, 2, 0)) * CFrame.Angles(rng:NextNumber(-0.15, 0.15), 0, rng:NextNumber(-0.1, 0.1)),
				COLORS.stone,
				Enum.Material.Slate
			)
		end
	end
end

local function buildSpawn(arena: Instance)
	local top = Arena.TIERS[#Arena.TIERS].top
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "SpawnDoTemplo"
	spawn.Anchored = true
	spawn.Size = Vector3.new(8, 1, 8)
	spawn.CFrame = CFrame.new(0, top - 0.45, 11)
	spawn.Transparency = 1
	spawn.CanCollide = false
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Parent = arena
end

function MapBuilder.setSealHealthFraction(fraction: number)
	local crystal = MapBuilder.sealCrystal
	local light = MapBuilder.sealLight
	if not crystal or not light then
		return
	end
	local color = SEAL_DANGER_COLOR:Lerp(SEAL_COLOR, math.clamp(fraction, 0, 1))
	crystal.Color = color
	light.Color = color
end

function MapBuilder.init()
	-- Remove o Baseplate/SpawnLocation do modelo padrão do Studio, se existir.
	for _, child in Workspace:GetChildren() do
		if child.Name == "Baseplate" or child:IsA("SpawnLocation") then
			child:Destroy()
		end
	end
	local old = Workspace:FindFirstChild("Arena")
	if old then
		old:Destroy()
	end

	setupLighting()

	local arena = Instance.new("Folder")
	arena.Name = "Arena"

	local rng = Random.new(1337)
	buildGround(arena, rng)
	buildTemple(arena)
	buildSpawn(arena)

	for i = 0, 3 do
		local direction = CFrame.Angles(0, i * math.pi / 2, 0)

		-- Caminho de pedra do templo até o portal.
		local pathStart, pathEnd = 36, Config.PORTAL_DISTANCE - 8
		local pathLength = pathEnd - pathStart
		block(
			arena,
			"Caminho",
			Vector3.new(10, 0.2, pathLength),
			direction * CFrame.new(0, 0.1, -(pathStart + pathLength / 2)),
			COLORS.path,
			Enum.Material.Cobblestone
		)

		buildTorii(arena, direction * CFrame.new(0, 0, -46))
		buildPortal(arena, direction * CFrame.new(0, 0, -Config.PORTAL_DISTANCE), rng)
		table.insert(MapBuilder.portals, (direction * CFrame.new(0, 0, -(Config.PORTAL_DISTANCE - 7))).Position)

		for _, distance in { 72, 112 } do
			for _, side in { -9, 9 } do
				buildStoneLantern(arena, (direction * CFrame.new(side, 0, -distance)).Position)
			end
		end
		local diagonal = CFrame.Angles(0, i * math.pi / 2 + math.pi / 4, 0)
		buildStoneLantern(arena, (diagonal * CFrame.new(0, 0, -44)).Position)
	end

	buildDecoration(arena, rng)
	arena.Parent = Workspace

	local enemies = Instance.new("Folder")
	enemies.Name = "Enemies"
	enemies.Parent = Workspace
end

return MapBuilder
