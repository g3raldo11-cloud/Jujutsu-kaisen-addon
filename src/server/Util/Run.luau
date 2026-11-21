--!strict
-- Dados de UMA partida por jogador (moedas, melhorias, energia...).
-- Some quando a partida acaba. O que fica salvo para sempre está em PlayerData.
-- Os valores são espelhados em Attributes do Player para a interface ler.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Upgrades = require(Shared:WaitForChild("Upgrades"))

export type RunData = {
	coins: number,
	kills: number,
	damageDealt: number,
	upgrades: { [string]: number },
	energy: number,
	ult: number,
	inMatch: boolean,
	ready: boolean,
	invulnerableUntil: number,
	domainActive: boolean,
	bossKills: number,
}

local data: { [Player]: RunData } = {}

local Run = {}

local function fresh(): RunData
	return {
		coins = 0,
		kills = 0,
		damageDealt = 0,
		upgrades = {},
		energy = Config.ENERGY_MAX,
		ult = 0,
		inMatch = false,
		ready = false,
		invulnerableUntil = 0,
		domainActive = false,
		bossKills = 0,
	}
end

local function sync(player: Player, run: RunData)
	player:SetAttribute("Coins", run.coins)
	player:SetAttribute("Energy", math.floor(run.energy))
	player:SetAttribute("MaxEnergy", Config.ENERGY_MAX)
	player:SetAttribute("Ult", math.floor(run.ult))
	player:SetAttribute("Ready", run.ready)
	player:SetAttribute("InMatch", run.inMatch)
	player:SetAttribute("Kills", run.kills)
	for _, upgrade in Upgrades.list do
		player:SetAttribute("Up_" .. upgrade.id, run.upgrades[upgrade.id] or 0)
	end
	local leaderstats = player:FindFirstChild("leaderstats")
	local killsValue = leaderstats and leaderstats:FindFirstChild("Abates")
	if killsValue and killsValue:IsA("IntValue") then
		killsValue.Value = run.kills
	end
end

function Run.get(player: Player): RunData?
	return data[player]
end

function Run.ensure(player: Player): RunData
	local run = data[player]
	if not run then
		run = fresh()
		data[player] = run
		sync(player, run)
	end
	return run
end

function Run.reset(player: Player)
	local run = fresh()
	data[player] = run
	sync(player, run)
end

function Run.all(): { [Player]: RunData }
	return data
end

function Run.addCoins(player: Player, amount: number)
	local run = Run.ensure(player)
	run.coins = math.max(0, run.coins + math.floor(amount))
	player:SetAttribute("Coins", run.coins)
end

function Run.addKill(player: Player)
	local run = Run.ensure(player)
	run.kills += 1
	sync(player, run)
end

function Run.setEnergy(player: Player, value: number)
	local run = Run.ensure(player)
	run.energy = math.clamp(value, 0, Config.ENERGY_MAX)
	local shown = math.floor(run.energy)
	if player:GetAttribute("Energy") ~= shown then
		player:SetAttribute("Energy", shown)
	end
end

function Run.setUlt(player: Player, value: number)
	local run = Run.ensure(player)
	run.ult = math.clamp(value, 0, Config.ULT_MAX)
	local shown = math.floor(run.ult)
	if player:GetAttribute("Ult") ~= shown then
		player:SetAttribute("Ult", shown)
	end
end

function Run.setReady(player: Player, ready: boolean)
	local run = Run.ensure(player)
	run.ready = ready
	player:SetAttribute("Ready", ready)
end

function Run.setInMatch(player: Player, inMatch: boolean)
	local run = Run.ensure(player)
	run.inMatch = inMatch
	player:SetAttribute("InMatch", inMatch)
end

function Run.upgradeLevel(player: Player, upgradeId: string): number
	local run = data[player]
	return if run then run.upgrades[upgradeId] or 0 else 0
end

function Run.setUpgradeLevel(player: Player, upgradeId: string, level: number)
	local run = Run.ensure(player)
	run.upgrades[upgradeId] = level
	player:SetAttribute("Up_" .. upgradeId, level)
end

local function perLevel(upgradeId: string): number
	local upgrade = Upgrades.byId[upgradeId]
	return if upgrade then upgrade.perLevel else 0
end

function Run.damageMultiplier(player: Player): number
	return 1 + perLevel("dano") * Run.upgradeLevel(player, "dano")
end

function Run.cooldownMultiplier(player: Player): number
	return math.max(0.4, 1 - perLevel("recarga") * Run.upgradeLevel(player, "recarga"))
end

function Run.energyRegenMultiplier(player: Player): number
	return 1 + perLevel("energia") * Run.upgradeLevel(player, "energia")
end

function Run.maxHealth(player: Player): number
	return Config.PLAYER_BASE_HEALTH + perLevel("vida") * Run.upgradeLevel(player, "vida")
end

function Run.walkSpeed(player: Player): number
	return Config.PLAYER_BASE_SPEED + perLevel("velocidade") * Run.upgradeLevel(player, "velocidade")
end

function Run.isInvulnerable(player: Player): boolean
	local run = data[player]
	return run ~= nil and os.clock() < run.invulnerableUntil
end

Players.PlayerRemoving:Connect(function(player)
	data[player] = nil
end)

return Run
