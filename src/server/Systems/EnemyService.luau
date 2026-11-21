--!strict
-- Maldições: criação dos modelos, inteligência (perseguir jogador ou selo),
-- ataques, projéteis inimigos, habilidades dos chefes e efeitos de status.
-- Toda a lógica roda no servidor; os clientes só desenham os efeitos.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Enemies = require(Shared:WaitForChild("Enemies"))
local GameState = require(Shared:WaitForChild("GameState"))
local Net = require(Shared:WaitForChild("Net"))
local Arena = require(Shared:WaitForChild("Util"):WaitForChild("Arena"))
local Signal = require(Shared:WaitForChild("Util"):WaitForChild("Signal"))

local Util = script.Parent.Parent:WaitForChild("Util")
local Run = require(Util:WaitForChild("Run"))

type Target = { player: Player, humanoid: Humanoid, root: BasePart }

export type Enemy = {
	id: number,
	def: any,
	model: Model,
	root: BasePart,
	alive: boolean,
	isBoss: boolean,
	health: number,
	maxHealth: number,
	damage: number,
	hpMult: number,
	dmgMult: number,
	position: Vector3,
	facing: Vector3,
	knock: Vector3,
	spawnedAt: number,
	nextAttack: number,
	retargetAt: number,
	target: Target?,
	slowUntil: number,
	slowFactor: number,
	burnTicks: number,
	burnDamage: number,
	burnNext: number,
	burnOwner: Player?,
	lastAttacker: Player?,
	casting: boolean,
	charging: boolean,
	chargeDir: Vector3,
	chargeEnd: number,
	chargeHit: { [Player]: boolean },
	nextAbility: number,
	abilityIndex: number,
}

type EnemyProjectile = {
	id: number,
	position: Vector3,
	direction: Vector3,
	speed: number,
	damage: number,
	life: number,
}

local EnemyService = {}
EnemyService.Killed = Signal.new() -- (enemy, killer: Player?)
EnemyService.SealHit = Signal.new() -- (amount)

local enemies: { Enemy } = {}
local projectiles: { EnemyProjectile } = {}
local nextEnemyId = 0
local nextProjectileId = 0
local folder: Instance

local SEAL_FLAT = Vector3.new(Config.SEAL_POSITION.X, 0, Config.SEAL_POSITION.Z)
local PLAYER_AGGRO = 42
local BOSS_AGGRO = 70

local function fx(kind: string, data: { [string]: any })
	Net.event("Fx"):FireAllClients(kind, data)
end

----------------------------------------------------------------------------
-- Modelos (feitos só com peças, sem precisar de arquivos externos)
----------------------------------------------------------------------------

local function newPart(size: Vector3, color: Color3, material: Enum.Material, shape: Enum.PartType?): Part
	local part = Instance.new("Part")
	part.Size = size
	part.Color = color
	part.Material = material
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	if shape then
		part.Shape = shape
	end
	return part
end

local function attach(model: Model, root: BasePart, part: BasePart, offset: CFrame, name: string)
	part.Name = name
	part.Anchored = false
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	part.CFrame = root.CFrame * offset
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = root
	weld.Part1 = part
	weld.Parent = part
	part.Parent = model
end

-- `start` é a posição inicial: a raiz é posicionada ANTES de soldar as peças,
-- assim as soldas guardam o deslocamento certo.
local function buildModel(def: any, start: CFrame): (Model, BasePart)
	local size: number = def.size
	local model = Instance.new("Model")
	model.Name = def.name

	local root = Instance.new("Part")
	root.Name = "Root"
	root.Size = Vector3.new(size * 0.9, size * 0.9, size * 0.9)
	root.Transparency = 1
	root.Anchored = true
	root.CanCollide = false
	root.CanTouch = false
	root.CanQuery = true
	root.CFrame = start
	root.Parent = model
	model.PrimaryPart = root

	local body = newPart(Vector3.one * size, def.color, Enum.Material.SmoothPlastic, Enum.PartType.Ball)
	attach(model, root, body, CFrame.new(), "Corpo")

	-- Olhos (a frente do modelo é o -Z).
	local eyes: number = def.eyes
	local spacing = math.min(0.22, 0.8 / eyes) * size
	for i = 1, eyes do
		local x = (i - (eyes + 1) / 2) * spacing
		local y = size * 0.14 + (if eyes > 3 and i % 2 == 0 then size * 0.12 else 0)
		local eye = newPart(Vector3.one * size * 0.17, def.eyeColor, Enum.Material.Neon, Enum.PartType.Ball)
		attach(model, root, eye, CFrame.new(x, y, -size * 0.43), "Olho")
	end

	local mouth = newPart(Vector3.new(size * 0.5, size * 0.1, size * 0.12), Color3.fromRGB(120, 0, 20), Enum.Material.Neon)
	attach(model, root, mouth, CFrame.new(0, -size * 0.16, -size * 0.43), "Boca")

	if def.horns then
		for _, side in { -1, 1 } do
			local horn = newPart(Vector3.new(size * 0.12, size * 0.45, size * 0.12), Color3.fromRGB(230, 220, 200), Enum.Material.SmoothPlastic)
			attach(model, root, horn, CFrame.new(side * size * 0.26, size * 0.48, -size * 0.05) * CFrame.Angles(0, 0, -side * 0.45), "Chifre")
		end
	end

	if def.kind == "ranged" then
		local sac = newPart(Vector3.one * size * 0.42, def.eyeColor, Enum.Material.Neon, Enum.PartType.Ball)
		sac.Transparency = 0.25
		attach(model, root, sac, CFrame.new(0, size * 0.42, size * 0.18), "Bolsa")
	else
		for _, side in { -1, 1 } do
			local arm = newPart(Vector3.one * size * 0.32, def.color, Enum.Material.SmoothPlastic, Enum.PartType.Ball)
			attach(model, root, arm, CFrame.new(side * size * 0.52, -size * 0.12, -size * 0.12), "Braco")
		end
	end

	if def.kind == "boss" then
		for k = 1, 6 do
			local angle = (k / 6) * math.pi * 2
			local spike = newPart(Vector3.new(size * 0.08, size * 0.35, size * 0.08), def.eyeColor, Enum.Material.Neon)
			attach(
				model,
				root,
				spike,
				CFrame.new(math.cos(angle) * size * 0.3, size * 0.52, math.sin(angle) * size * 0.3)
					* CFrame.Angles(math.sin(angle) * 0.4, 0, -math.cos(angle) * 0.4),
				"Coroa"
			)
		end
		local light = Instance.new("PointLight")
		light.Color = def.eyeColor
		light.Range = size * 2.5
		light.Brightness = 2
		light.Parent = body
	end

	return model, root
end

----------------------------------------------------------------------------
-- Consultas usadas pelo combate
----------------------------------------------------------------------------

function EnemyService.all(): { Enemy }
	return enemies
end

function EnemyService.count(): number
	local count = 0
	for _, enemy in enemies do
		if enemy.alive then
			count += 1
		end
	end
	return count
end

function EnemyService.inRadius(center: Vector3, radius: number): { Enemy }
	local result = {}
	for _, enemy in enemies do
		if enemy.alive and Arena.flatDistance(enemy.position, center) <= radius + enemy.def.size / 2 then
			table.insert(result, enemy)
		end
	end
	return result
end

function EnemyService.inSegment(a: Vector3, b: Vector3, radius: number): { Enemy }
	local result = {}
	for _, enemy in enemies do
		if enemy.alive and Arena.distanceToSegment(enemy.position, a, b) <= radius + enemy.def.size / 2 then
			table.insert(result, enemy)
		end
	end
	return result
end

function EnemyService.nearest(center: Vector3, maxDistance: number, exclude: { [Enemy]: boolean }?): Enemy?
	local best: Enemy? = nil
	local bestDistance = maxDistance
	for _, enemy in enemies do
		if enemy.alive and not (exclude and exclude[enemy]) then
			local distance = Arena.flatDistance(enemy.position, center)
			if distance < bestDistance then
				best = enemy
				bestDistance = distance
			end
		end
	end
	return best
end

function EnemyService.worldPosition(enemy: Enemy): Vector3
	return enemy.root.Position
end

----------------------------------------------------------------------------
-- Dano e status
----------------------------------------------------------------------------

local function kill(enemy: Enemy)
	if not enemy.alive then
		return
	end
	enemy.alive = false
	fx("death", {
		position = enemy.root.Position,
		size = enemy.def.size,
		color = enemy.def.eyeColor,
		bodyColor = enemy.def.color,
		boss = enemy.isBoss,
	})
	enemy.model:Destroy()
	if enemy.isBoss then
		GameState.set("BossName", "")
	end
	EnemyService.Killed:Fire(enemy, enemy.lastAttacker)
end

function EnemyService.damage(enemy: Enemy, amount: number, attacker: Player?): number
	if not enemy.alive or amount ~= amount or amount <= 0 then
		return 0
	end
	local dealt = math.min(enemy.health, amount)
	enemy.health -= dealt
	if attacker then
		enemy.lastAttacker = attacker
	end
	enemy.model:SetAttribute("Health", math.max(0, math.ceil(enemy.health)))
	if enemy.isBoss then
		GameState.set("BossHealth", math.max(0, math.ceil(enemy.health)))
	end
	if enemy.health <= 0 then
		kill(enemy)
	end
	return dealt
end

function EnemyService.addBurn(enemy: Enemy, damagePerTick: number, ticks: number, owner: Player?)
	if not enemy.alive then
		return
	end
	enemy.burnTicks = math.max(enemy.burnTicks, ticks)
	enemy.burnDamage = math.max(enemy.burnDamage, damagePerTick)
	enemy.burnOwner = owner
	if enemy.burnNext < os.clock() then
		enemy.burnNext = os.clock() + 0.5
	end
	enemy.model:SetAttribute("Burning", true)
end

function EnemyService.addSlow(enemy: Enemy, factor: number, duration: number)
	if not enemy.alive then
		return
	end
	if enemy.isBoss then
		factor = 1 - (1 - factor) * 0.5
	end
	enemy.slowFactor = if os.clock() < enemy.slowUntil then math.min(enemy.slowFactor, factor) else factor
	enemy.slowUntil = math.max(enemy.slowUntil, os.clock() + duration)
	enemy.model:SetAttribute("Slowed", true)
end

-- Força positiva empurra para longe de `from`; negativa puxa para perto.
function EnemyService.knockback(enemy: Enemy, from: Vector3, strength: number)
	if not enemy.alive then
		return
	end
	local offset = Arena.flat(enemy.position - from)
	if offset.Magnitude < 0.05 then
		return
	end
	local resist = if enemy.isBoss then 0.12 else math.clamp(4 / enemy.def.size, 0.4, 1.2)
	enemy.knock += offset.Unit * strength * 6 * resist
end

----------------------------------------------------------------------------
-- Ataques contra jogadores
----------------------------------------------------------------------------

local function hurtPlayer(target: Target, amount: number)
	if target.humanoid.Health <= 0 or Run.isInvulnerable(target.player) then
		return
	end
	target.humanoid:TakeDamage(amount)
	Net.event("Fx"):FireClient(target.player, "hurt", { amount = amount })
end

local function collectTargets(): { Target }
	local targets: { Target } = {}
	for _, player in Players:GetPlayers() do
		local character = player.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local root = character and character:FindFirstChild("HumanoidRootPart")
		if humanoid and humanoid.Health > 0 and root and root:IsA("BasePart") then
			table.insert(targets, { player = player, humanoid = humanoid, root = root })
		end
	end
	return targets
end

local function fireProjectile(origin: Vector3, direction: Vector3, speed: number, damage: number, color: Color3, size: number)
	nextProjectileId += 1
	local range = 70
	local projectile: EnemyProjectile = {
		id = nextProjectileId,
		position = origin,
		direction = direction,
		speed = speed,
		damage = damage,
		life = range / speed,
	}
	table.insert(projectiles, projectile)
	fx("eproj", {
		id = projectile.id,
		origin = origin,
		direction = direction,
		speed = speed,
		life = projectile.life,
		color = color,
		size = size,
	})
end

local function stepProjectiles(dt: number, targets: { Target })
	for index = #projectiles, 1, -1 do
		local projectile = projectiles[index]
		projectile.position += projectile.direction * projectile.speed * dt
		projectile.life -= dt
		local hit = false
		for _, target in targets do
			local rootPosition = target.root.Position
			if
				Arena.flatDistance(rootPosition, projectile.position) < 2.4
				and math.abs(rootPosition.Y - projectile.position.Y) < 5
			then
				hurtPlayer(target, projectile.damage)
				hit = true
				break
			end
		end
		if not hit and Arena.flatDistance(projectile.position, SEAL_FLAT) < Config.SEAL_RADIUS + 1 then
			EnemyService.SealHit:Fire(projectile.damage)
			hit = true
		end
		if hit or projectile.life <= 0 then
			table.remove(projectiles, index)
			fx("eprojEnd", { id = projectile.id, position = projectile.position, hit = hit })
		end
	end
end

----------------------------------------------------------------------------
-- Habilidades de chefe
----------------------------------------------------------------------------

local function nearestTargetPosition(enemy: Enemy): Vector3
	local best = SEAL_FLAT
	local bestDistance = math.huge
	for _, target in collectTargets() do
		local distance = Arena.flatDistance(target.root.Position, enemy.position)
		if distance < bestDistance then
			bestDistance = distance
			best = target.root.Position
		end
	end
	return Arena.flat(best)
end

local function castAbility(enemy: Enemy, ability: string)
	local def = enemy.def
	if ability == "slam" then
		enemy.casting = true
		local radius = def.size * 1.5
		local center = Arena.flat(enemy.position)
		fx("telegraph", { position = center, radius = radius, duration = 1.1, color = Color3.fromRGB(255, 40, 60) })
		task.wait(1.1)
		enemy.casting = false
		if not enemy.alive then
			return
		end
		center = Arena.flat(enemy.position)
		fx("slam", { position = center, radius = radius, color = def.eyeColor })
		for _, target in collectTargets() do
			if Arena.flatDistance(target.root.Position, center) <= radius then
				hurtPlayer(target, enemy.damage * 1.3)
			end
		end
		if Arena.flatDistance(center, SEAL_FLAT) <= radius + Config.SEAL_RADIUS then
			EnemyService.SealHit:Fire(enemy.damage * 2)
		end
	elseif ability == "charge" then
		enemy.casting = true
		local destination = nearestTargetPosition(enemy)
		local offset = Arena.flat(destination - enemy.position)
		local direction = if offset.Magnitude > 0.1 then offset.Unit else enemy.facing
		local distance = 48
		enemy.facing = direction
		fx("chargeLine", {
			from = Arena.flat(enemy.position),
			to = Arena.flat(enemy.position) + direction * distance,
			width = def.size,
			duration = 0.85,
		})
		task.wait(0.85)
		enemy.casting = false
		if not enemy.alive then
			return
		end
		enemy.charging = true
		enemy.chargeDir = direction
		enemy.chargeEnd = os.clock() + distance / (def.speed * 3.4)
		enemy.chargeHit = {}
	elseif ability == "summon" then
		fx("summon", { position = enemy.root.Position, color = def.eyeColor, size = def.size })
		for i = 1, 3 do
			local angle = (i / 3) * math.pi * 2
			local position = enemy.position + Vector3.new(math.cos(angle), 0, math.sin(angle)) * def.size
			EnemyService.spawn("menor", position, enemy.hpMult, enemy.dmgMult)
		end
	elseif ability == "volley" then
		enemy.casting = true
		fx("roar", { position = enemy.root.Position, color = def.eyeColor, size = def.size })
		task.wait(0.5)
		for ring = 0, 1 do
			if not enemy.alive then
				break
			end
			local origin = enemy.root.Position
			for i = 1, 10 do
				local angle = (i / 10) * math.pi * 2 + ring * (math.pi / 10)
				local direction = Vector3.new(math.cos(angle), 0, math.sin(angle))
				fireProjectile(
					Vector3.new(origin.X, Arena.groundHeight(origin) + 3, origin.Z) + direction * def.size * 0.5,
					direction,
					def.projectileSpeed or 50,
					enemy.damage * 0.6,
					def.eyeColor,
					1.6
				)
			end
			task.wait(0.4)
		end
		enemy.casting = false
	end
end

----------------------------------------------------------------------------
-- Criação
----------------------------------------------------------------------------

function EnemyService.spawn(defId: string, position: Vector3, hpMult: number, dmgMult: number): Enemy?
	local def = Enemies.defs[defId]
	if not def then
		return nil
	end
	nextEnemyId += 1
	local flatPosition = Arena.flat(position)
	local facing = Arena.flat(SEAL_FLAT - flatPosition)
	facing = if facing.Magnitude > 0.1 then facing.Unit else Vector3.new(0, 0, -1)
	local startY = Arena.groundHeight(flatPosition) - def.size * 0.6
	local startPosition = flatPosition + Vector3.new(0, startY, 0)
	local model, root = buildModel(def, CFrame.lookAt(startPosition, startPosition + facing))
	local maxHealth = math.max(1, math.floor(def.health * hpMult))
	local isBoss = def.kind == "boss"
	local now = os.clock()

	local enemy: Enemy = {
		id = nextEnemyId,
		def = def,
		model = model,
		root = root,
		alive = true,
		isBoss = isBoss,
		health = maxHealth,
		maxHealth = maxHealth,
		damage = def.damage * dmgMult,
		hpMult = hpMult,
		dmgMult = dmgMult,
		position = flatPosition,
		facing = facing,
		knock = Vector3.zero,
		spawnedAt = now,
		nextAttack = now + 1,
		retargetAt = 0,
		target = nil,
		slowUntil = 0,
		slowFactor = 1,
		burnTicks = 0,
		burnDamage = 0,
		burnNext = 0,
		burnOwner = nil,
		lastAttacker = nil,
		casting = false,
		charging = false,
		chargeDir = facing,
		chargeEnd = 0,
		chargeHit = {},
		nextAbility = now + 4,
		abilityIndex = 0,
	}

	model:SetAttribute("EnemyName", def.name)
	model:SetAttribute("Health", maxHealth)
	model:SetAttribute("MaxHealth", maxHealth)
	model:SetAttribute("Boss", isBoss)
	model:SetAttribute("Size", def.size)
	model.Parent = folder
	table.insert(enemies, enemy)

	fx("spawn", { position = flatPosition, size = def.size, color = def.eyeColor })
	if isBoss then
		GameState.set("BossName", def.name)
		GameState.set("BossMaxHealth", maxHealth)
		GameState.set("BossHealth", maxHealth)
	end
	return enemy
end

function EnemyService.clearAll()
	for _, enemy in enemies do
		if enemy.alive then
			enemy.alive = false
			enemy.model:Destroy()
		end
	end
	table.clear(enemies)
	table.clear(projectiles)
	GameState.set("BossName", "")
	fx("clear", {})
end

----------------------------------------------------------------------------
-- Inteligência (roda todo frame)
----------------------------------------------------------------------------

local function updateEnemy(enemy: Enemy, dt: number, now: number, targets: { Target })
	local def = enemy.def
	local size: number = def.size

	-- Queimadura
	if enemy.burnTicks > 0 and now >= enemy.burnNext then
		enemy.burnTicks -= 1
		enemy.burnNext = now + 0.5
		local owner = enemy.burnOwner
		local dealt = EnemyService.damage(enemy, enemy.burnDamage, owner)
		if owner and dealt > 0 then
			Net.event("Fx"):FireClient(owner, "dmg", {
				position = enemy.root.Position + Vector3.new(0, size * 0.6, 0),
				amount = dealt,
				color = Color3.fromRGB(255, 140, 50),
			})
		end
		if not enemy.alive then
			return
		end
		if enemy.burnTicks <= 0 then
			enemy.burnDamage = 0
			enemy.model:SetAttribute("Burning", false)
		end
	end
	if enemy.slowUntil > 0 and now >= enemy.slowUntil then
		enemy.slowUntil = 0
		enemy.slowFactor = 1
		enemy.model:SetAttribute("Slowed", false)
	end

	local risen = math.clamp((now - enemy.spawnedAt) / 0.7, 0, 1)

	-- Escolhe alvo: jogador perto, senão o Selo.
	local currentTarget = enemy.target
	if currentTarget and (currentTarget.humanoid.Health <= 0 or not currentTarget.root.Parent) then
		enemy.target = nil
	end
	if now >= enemy.retargetAt then
		enemy.retargetAt = now + 0.4
		local best: Target? = nil
		local bestDistance = if enemy.isBoss then BOSS_AGGRO else PLAYER_AGGRO
		for _, target in targets do
			local distance = Arena.flatDistance(target.root.Position, enemy.position)
			if distance < bestDistance then
				best = target
				bestDistance = distance
			end
		end
		enemy.target = best
	end

	local target = enemy.target
	local targetPosition = if target then Arena.flat(target.root.Position) else SEAL_FLAT
	local targetRadius = if target then 1.5 else Config.SEAL_RADIUS
	local toTarget = targetPosition - enemy.position
	local distance = toTarget.Magnitude
	local direction = if distance > 0.01 then toTarget.Unit else enemy.facing
	local gap = distance - size / 2 - targetRadius

	-- Movimento
	local speed = def.speed * (if now < enemy.slowUntil then enemy.slowFactor else 1)
	local move = Vector3.zero
	if enemy.charging then
		move = enemy.chargeDir * def.speed * 3.4
		for _, t in targets do
			if not enemy.chargeHit[t.player] and Arena.flatDistance(t.root.Position, enemy.position) < size / 2 + 2.5 then
				enemy.chargeHit[t.player] = true
				hurtPlayer(t, enemy.damage * 1.2)
			end
		end
		if now >= enemy.chargeEnd then
			enemy.charging = false
		end
	elseif risen >= 1 and not enemy.casting then
		if def.kind == "ranged" then
			local preferred = def.preferredRange or 25
			if gap > preferred + 4 then
				move = direction * speed
			elseif gap < preferred - 6 then
				move = -direction * speed * 0.7
			end
		elseif gap > def.attackRange * 0.6 then
			move = direction * speed
		end
		if distance > 0.01 then
			enemy.facing = enemy.facing:Lerp(direction, math.min(1, dt * 8))
			if enemy.facing.Magnitude < 0.01 then
				enemy.facing = direction
			else
				enemy.facing = enemy.facing.Unit
			end
		end
	end

	-- Separação: maldições não ficam umas dentro das outras.
	local push = Vector3.zero
	for _, other in enemies do
		if other ~= enemy and other.alive then
			local offset = enemy.position - other.position
			local minimum = (size + other.def.size) * 0.45
			local d = offset.Magnitude
			if d < minimum and d > 0.01 then
				push += offset.Unit * (minimum - d)
			end
		end
	end

	local newPosition = enemy.position + (move + enemy.knock) * dt + push * math.min(1, dt * 8)
	enemy.knock *= math.exp(-6 * dt)

	-- Não atravessa o Selo nem sai do mapa.
	local fromSeal = newPosition - SEAL_FLAT
	local minimumSeal = Config.SEAL_RADIUS + size / 2
	if fromSeal.Magnitude < minimumSeal and fromSeal.Magnitude > 0.01 then
		newPosition = SEAL_FLAT + fromSeal.Unit * minimumSeal
	end
	local limit = Config.ARENA_LIMIT
	newPosition = Vector3.new(math.clamp(newPosition.X, -limit, limit), 0, math.clamp(newPosition.Z, -limit, limit))
	enemy.position = newPosition

	-- Posição final com "flutuação".
	local ground = Arena.groundHeight(newPosition)
	local bob = math.sin(now * (if enemy.isBoss then 2 else 6) + enemy.id) * size * 0.05
	local y = ground + size / 2 + bob - (1 - risen) * size * 1.1
	local worldPosition = Vector3.new(newPosition.X, y, newPosition.Z)
	local look = if enemy.charging then enemy.chargeDir else enemy.facing
	enemy.root.CFrame = CFrame.lookAt(worldPosition, worldPosition + look)

	-- Ataque básico
	if risen >= 1 and not enemy.charging and not enemy.casting and now >= enemy.nextAttack then
		if def.kind == "ranged" then
			if gap <= def.attackRange then
				enemy.nextAttack = now + def.attackCooldown
				local origin = Vector3.new(newPosition.X, ground + 3, newPosition.Z) + direction * size * 0.5
				fireProjectile(origin, direction, def.projectileSpeed or 55, enemy.damage, def.eyeColor, 1.2)
			end
		elseif gap <= def.attackRange then
			enemy.nextAttack = now + def.attackCooldown
			if target then
				hurtPlayer(target, enemy.damage)
			else
				EnemyService.SealHit:Fire(enemy.damage)
			end
			fx("enemyAttack", {
				position = worldPosition + direction * size * 0.5,
				size = size,
				color = def.eyeColor,
			})
		end
	end

	-- Habilidades de chefe
	if enemy.isBoss and risen >= 1 and now >= enemy.nextAbility and not enemy.casting and not enemy.charging then
		local abilities = def.abilities or {}
		if #abilities > 0 then
			enemy.abilityIndex = enemy.abilityIndex % #abilities + 1
			enemy.nextAbility = now + (def.abilityCooldown or 6)
			task.spawn(castAbility, enemy, abilities[enemy.abilityIndex])
		end
	end
end

local function step(dt: number)
	if #enemies == 0 and #projectiles == 0 then
		return
	end
	local now = os.clock()
	local targets = collectTargets()
	for _, enemy in table.clone(enemies) do
		if enemy.alive then
			updateEnemy(enemy, dt, now, targets)
		end
	end
	stepProjectiles(dt, targets)

	-- Remove os mortos da lista.
	for index = #enemies, 1, -1 do
		if not enemies[index].alive then
			table.remove(enemies, index)
		end
	end
end

function EnemyService.init()
	folder = Workspace:WaitForChild("Enemies")
end

function EnemyService.start()
	RunService.Heartbeat:Connect(step)
end

return EnemyService
