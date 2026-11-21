--!strict
-- Combate dos jogadores: golpe básico em combo, as 3 habilidades da técnica,
-- o Território (golpe especial), energia e carga do especial.
-- O cliente só PEDE ("usei o slot 2 mirando aqui"); o servidor confere
-- recarga, energia e distância, e calcula todo o dano.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Net = require(Shared:WaitForChild("Net"))
local Techniques = require(Shared:WaitForChild("Techniques"))
local Arena = require(Shared:WaitForChild("Util"):WaitForChild("Arena"))

local Util = script.Parent.Parent:WaitForChild("Util")
local Guard = require(Util:WaitForChild("Guard"))
local RateLimit = require(Util:WaitForChild("RateLimit"))
local Run = require(Util:WaitForChild("Run"))
local CharacterService = require(script.Parent:WaitForChild("CharacterService"))
local EnemyService = require(script.Parent:WaitForChild("EnemyService"))

type Enemy = any -- registro de inimigo (ver EnemyService.Enemy)

type HitOptions = {
	chained: boolean?,
	noEffect: boolean?,
	origin: Vector3?,
	crit: boolean?,
}

type Projectile = {
	id: number,
	owner: Player,
	technique: any,
	position: Vector3,
	direction: Vector3,
	speed: number,
	remaining: number,
	radius: number,
	damage: number,
	pierce: boolean,
	hit: { [Enemy]: boolean },
}

type Domain = {
	owner: Player,
	technique: any,
	center: Vector3,
	radius: number,
	endsAt: number,
	nextTick: number,
}

local CombatService = {}

local cooldowns: { [Player]: { [number]: number } } = {}
local combo: { [Player]: { count: number, last: number } } = {}
local projectiles: { Projectile } = {}
local domains: { Domain } = {}
local nextProjectileId = 0

local MAX_AIM_DISTANCE = 600

local function fxAll(kind: string, data: { [string]: any })
	Net.event("Fx"):FireAllClients(kind, data)
end

local function fxTo(player: Player, kind: string, data: { [string]: any })
	Net.event("Fx"):FireClient(player, kind, data)
end

local function techniqueOf(player: Player): any
	local id = player:GetAttribute("Technique")
	return if typeof(id) == "string" then Techniques.byId[id] else nil
end

----------------------------------------------------------------------------
-- Aplicar dano (todo dano de jogador passa por aqui)
----------------------------------------------------------------------------

local applyHit: (player: Player, enemy: Enemy, baseDamage: number, technique: any, options: HitOptions?) -> ()

function applyHit(player: Player, enemy: Enemy, baseDamage: number, technique: any, options: HitOptions?)
	if not enemy.alive then
		return
	end
	local opts: HitOptions = options or {}
	local crit = opts.crit == true or math.random() < 0.08
	local amount = baseDamage * Run.damageMultiplier(player) * (if crit then 1.5 else 1)
	local position = enemy.root.Position
	local dealt = EnemyService.damage(enemy, amount, player)
	if dealt <= 0 then
		return
	end

	local run = Run.get(player)
	if run then
		run.damageDealt += dealt
		Run.setEnergy(player, run.energy + Config.ENERGY_ON_HIT)
		if not run.domainActive then
			Run.setUlt(player, run.ult + dealt * Config.ULT_PER_DAMAGE)
		end
	end

	fxTo(player, "dmg", {
		position = position + Vector3.new(0, enemy.def.size * 0.6, 0),
		amount = dealt,
		color = if crit then Color3.fromRGB(255, 230, 80) else Color3.new(1, 1, 1),
		crit = crit,
	})

	if opts.noEffect or not technique then
		return
	end

	local effect = technique.effect
	local origin = opts.origin or position
	if effect == "knockback" then
		EnemyService.knockback(enemy, origin, 7)
	elseif effect == "burn" then
		EnemyService.addBurn(enemy, dealt * 0.22, 4, player)
	elseif effect == "slow" then
		EnemyService.addSlow(enemy, 0.45, 2.5)
	elseif effect == "chain" and not opts.chained then
		local exclude: { [Enemy]: boolean } = { [enemy] = true }
		local from = position
		for _ = 1, 2 do
			local nextEnemy = EnemyService.nearest(from, 20, exclude)
			if not nextEnemy then
				break
			end
			exclude[nextEnemy] = true
			local to = nextEnemy.root.Position
			fxAll("chain", { from = from, to = to, color = technique.color })
			applyHit(player, nextEnemy, baseDamage * 0.6, technique, { chained = true })
			from = to
		end
	elseif effect == "lifesteal" then
		CharacterService.heal(player, dealt * 0.15)
	elseif effect == "pull" then
		EnemyService.knockback(enemy, origin, -5)
	end
end

local function healAllies(center: Vector3, radius: number, amount: number)
	for _, ally in Players:GetPlayers() do
		local root = CharacterService.getRoot(ally)
		if root and CharacterService.isAlive(ally) and Arena.flatDistance(root.Position, center) <= radius then
			CharacterService.heal(ally, amount)
			fxAll("heal", { position = root.Position, amount = amount })
		end
	end
end

----------------------------------------------------------------------------
-- Habilidades
----------------------------------------------------------------------------

local function doBasicAttack(player: Player, root: BasePart, direction: Vector3, technique: any)
	local now = os.clock()
	local state = combo[player]
	if not state or now - state.last > Config.M1_COMBO_RESET then
		state = { count = 0, last = now }
		combo[player] = state
	end
	local current = state :: { count: number, last: number }
	current.count = current.count % 4 + 1
	current.last = now
	local finisher = current.count == 4

	local damage = Config.M1_DAMAGE * (if finisher then Config.M1_FINISHER_MULT else 1)
	local range = Config.M1_RANGE + (if finisher then 2 else 0)
	local origin = root.Position
	local color = if technique then technique.color else Color3.new(1, 1, 1)

	for _, enemy in EnemyService.inRadius(origin, range) do
		local toEnemy = Arena.flat(enemy.position - origin)
		local facing = if toEnemy.Magnitude > 0.1 then toEnemy.Unit:Dot(direction) else 1
		if facing > 0.2 then
			applyHit(player, enemy, damage, technique, { noEffect = not finisher, origin = origin })
			if finisher then
				EnemyService.knockback(enemy, origin, 6)
			end
		end
	end

	fxAll("m1", { position = origin, direction = direction, color = color, finisher = finisher, combo = current.count })
end

local function fireProjectile(player: Player, root: BasePart, direction: Vector3, skill: any, technique: any)
	local count = skill.count or 1
	local spread = math.rad(12)
	for i = 1, count do
		local angle = (i - (count + 1) / 2) * spread
		local dir = (CFrame.Angles(0, angle, 0) * CFrame.new(Vector3.zero, direction)).LookVector
		dir = Arena.flat(dir).Unit
		nextProjectileId += 1
		local origin = root.Position + dir * 2.5
		local projectile: Projectile = {
			id = nextProjectileId,
			owner = player,
			technique = technique,
			position = origin,
			direction = dir,
			speed = skill.speed or 100,
			remaining = skill.range or 100,
			radius = skill.radius,
			damage = skill.damage,
			pierce = technique.effect == "pierce",
			hit = {},
		}
		table.insert(projectiles, projectile)
		fxAll("proj", {
			id = projectile.id,
			origin = origin,
			direction = dir,
			speed = projectile.speed,
			range = projectile.remaining,
			radius = projectile.radius,
			color = technique.color,
			color2 = technique.secondary,
			tech = technique.id,
		})
	end
end

local function doBurst(player: Player, root: BasePart, skill: any, technique: any)
	local center = root.Position
	for _, enemy in EnemyService.inRadius(center, skill.radius) do
		applyHit(player, enemy, skill.damage, technique, { origin = center })
	end
	if technique.effect == "heal" then
		healAllies(center, skill.radius + 6, 25)
	end
	fxAll("burst", {
		position = center,
		radius = skill.radius,
		color = technique.color,
		color2 = technique.secondary,
		tech = technique.id,
	})
end

local function doDash(player: Player, root: BasePart, direction: Vector3, skill: any, technique: any): Vector3
	local from = root.Position
	local range: number = skill.range or 25
	local to = from + direction * range
	local limit = Config.ARENA_LIMIT
	to = Vector3.new(math.clamp(to.X, -limit, limit), from.Y, math.clamp(to.Z, -limit, limit))
	for _, enemy in EnemyService.inSegment(from, to, skill.radius) do
		applyHit(player, enemy, skill.damage, technique, { origin = from })
	end
	local run = Run.get(player)
	if run then
		run.invulnerableUntil = os.clock() + Config.DASH_INVULNERABILITY
	end
	fxAll("dash", { from = from, to = to, color = technique.color, color2 = technique.secondary })
	return to - from
end

local function doDomain(player: Player, root: BasePart, technique: any)
	local domain = technique.domain
	local run = Run.get(player)
	if run then
		run.domainActive = true
	end
	local center = Vector3.new(root.Position.X, 0, root.Position.Z)
	table.insert(domains, {
		owner = player,
		technique = technique,
		center = center,
		radius = domain.radius,
		endsAt = os.clock() + domain.duration,
		nextTick = os.clock() + 0.3,
	})
	fxAll("domain", {
		position = center,
		radius = domain.radius,
		duration = domain.duration,
		color = technique.color,
		color2 = technique.secondary,
		name = domain.name,
		owner = player.DisplayName,
		tech = technique.id,
	})
	local subtitle = `{player.DisplayName} expandiu o Território!`
	Net.event("Announce"):FireAllClients(domain.name, subtitle, technique.color, 2.4)
end

----------------------------------------------------------------------------
-- Pedido do cliente
----------------------------------------------------------------------------

local function onUseSkill(player: Player, slot: unknown, aim: unknown)
	if not RateLimit.allow(player, "UseSkill", 12, 14) then
		return
	end
	if not Guard.integerInRange(slot, 0, 4) or not Guard.vector3(aim) then
		return
	end
	local slotNumber = slot :: number
	local aimPoint = aim :: Vector3

	if not CharacterService.isAlive(player) then
		return
	end
	local root = CharacterService.getRoot(player)
	local run = Run.get(player)
	local technique = techniqueOf(player)
	if not root or not run or not technique then
		return
	end

	-- Direção da mira (plana). Mira absurda = usa para onde o personagem olha.
	local offset = Arena.flat(aimPoint - root.Position)
	local direction: Vector3
	if offset.Magnitude > 0.5 and offset.Magnitude < MAX_AIM_DISTANCE then
		direction = offset.Unit
	else
		local look = Arena.flat(root.CFrame.LookVector)
		direction = if look.Magnitude > 0.01 then look.Unit else Vector3.new(0, 0, -1)
	end

	local now = os.clock()
	local playerCooldowns = cooldowns[player]
	if not playerCooldowns then
		playerCooldowns = {}
		cooldowns[player] = playerCooldowns
	end
	local readyAt = playerCooldowns[slotNumber] or 0
	if now < readyAt - 0.08 then -- pequena folga para a latência
		return
	end

	if slotNumber == 0 then
		playerCooldowns[0] = now + Config.M1_COOLDOWN
		doBasicAttack(player, root, direction, technique)
		return
	end

	if slotNumber == 4 then
		if run.ult < Config.ULT_MAX or run.domainActive then
			Net.event("Notify"):FireClient(player, "O Território ainda não está carregado.", Color3.fromRGB(255, 200, 120))
			return
		end
		Run.setUlt(player, 0)
		playerCooldowns[4] = now + technique.domain.duration
		doDomain(player, root, technique)
		Net.event("SkillResult"):FireClient(player, 4, technique.domain.duration, nil)
		return
	end

	local skill = technique.skills[slotNumber]
	if not skill then
		return
	end
	if run.energy < skill.cost then
		Net.event("Notify"):FireClient(player, "Energia amaldiçoada insuficiente!", Color3.fromRGB(120, 170, 255))
		return
	end
	Run.setEnergy(player, run.energy - skill.cost)
	local cooldown = skill.cooldown * Run.cooldownMultiplier(player)
	playerCooldowns[slotNumber] = now + cooldown

	local extra: { [string]: any }? = nil
	if skill.kind == "projectile" then
		fireProjectile(player, root, direction, skill, technique)
	elseif skill.kind == "burst" then
		doBurst(player, root, skill, technique)
	elseif skill.kind == "dash" then
		local movement = doDash(player, root, direction, skill, technique)
		extra = { dash = movement }
	end
	Net.event("SkillResult"):FireClient(player, slotNumber, cooldown, extra)
end

----------------------------------------------------------------------------
-- Simulação por frame
----------------------------------------------------------------------------

local function stepProjectiles(dt: number)
	for index = #projectiles, 1, -1 do
		local projectile = projectiles[index]
		local travel = projectile.speed * dt
		projectile.position += projectile.direction * travel
		projectile.remaining -= travel

		local finished = projectile.remaining <= 0 or not projectile.owner.Parent
		if not finished then
			for _, enemy in EnemyService.inRadius(projectile.position, projectile.radius * 0.5 + 1) do
				if not projectile.hit[enemy] then
					projectile.hit[enemy] = true
					applyHit(projectile.owner, enemy, projectile.damage, projectile.technique, { origin = projectile.position })
					if not projectile.pierce then
						finished = true
						break
					end
				end
			end
		end

		if finished then
			table.remove(projectiles, index)
			fxAll("projEnd", {
				id = projectile.id,
				position = projectile.position,
				radius = projectile.radius,
				color = projectile.technique.color,
			})
		end
	end
end

local function stepDomains()
	local now = os.clock()
	for index = #domains, 1, -1 do
		local domain = domains[index]
		local owner = domain.owner
		if now >= domain.endsAt or not owner.Parent then
			table.remove(domains, index)
			local run = Run.get(owner)
			if run then
				run.domainActive = false
			end
			fxAll("domainEnd", { position = domain.center })
		elseif now >= domain.nextTick then
			local technique = domain.technique
			domain.nextTick = now + technique.domain.tick
			for _, enemy in EnemyService.inRadius(domain.center, domain.radius) do
				applyHit(owner, enemy, technique.domain.damage, technique, {
					chained = true, -- sem raios em cadeia a cada pulso (seria efeito demais)
					origin = domain.center,
				})
			end
			-- Aliados dentro do Território recuperam energia (e vida, no Sol).
			for _, ally in Players:GetPlayers() do
				local root = CharacterService.getRoot(ally)
				if root and Arena.flatDistance(root.Position, domain.center) <= domain.radius then
					local allyRun = Run.get(ally)
					if allyRun then
						Run.setEnergy(ally, allyRun.energy + 3)
					end
					if technique.effect == "heal" then
						CharacterService.heal(ally, 4)
					end
				end
			end
		end
	end
end

local energyAccumulator = 0
local function stepEnergy(dt: number)
	energyAccumulator += dt
	if energyAccumulator < 0.2 then
		return
	end
	local elapsed = energyAccumulator
	energyAccumulator = 0
	for player, run in Run.all() do
		if run.energy < Config.ENERGY_MAX and CharacterService.isAlive(player) then
			Run.setEnergy(player, run.energy + Config.ENERGY_REGEN * Run.energyRegenMultiplier(player) * elapsed)
		end
	end
end

function CombatService.resetPlayer(player: Player)
	cooldowns[player] = nil
	combo[player] = nil
end

function CombatService.clearAll()
	table.clear(projectiles)
	for _, domain in domains do
		local run = Run.get(domain.owner)
		if run then
			run.domainActive = false
		end
	end
	table.clear(domains)
	table.clear(cooldowns)
end

function CombatService.start()
	Net.event("UseSkill").OnServerEvent:Connect(onUseSkill)

	EnemyService.Killed:Connect(function(enemy: Enemy, killer: Player?)
		if killer and killer.Parent then
			local run = Run.get(killer)
			if run then
				Run.setUlt(killer, run.ult + Config.ULT_PER_KILL)
			end
		end
	end)

	RunService.Heartbeat:Connect(function(dt)
		stepProjectiles(dt)
		stepDomains()
		stepEnergy(dt)
	end)

	Players.PlayerRemoving:Connect(function(player)
		cooldowns[player] = nil
		combo[player] = nil
	end)
end

return CombatService
