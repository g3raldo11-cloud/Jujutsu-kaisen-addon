--!strict
-- Loja de melhorias (usa as moedas da partida). Preço e efeito são
-- decididos aqui no servidor; o cliente só manda o id do item.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local GameState = require(Shared:WaitForChild("GameState"))
local Net = require(Shared:WaitForChild("Net"))
local Upgrades = require(Shared:WaitForChild("Upgrades"))

local Util = script.Parent.Parent:WaitForChild("Util")
local Guard = require(Util:WaitForChild("Guard"))
local RateLimit = require(Util:WaitForChild("RateLimit"))
local Run = require(Util:WaitForChild("Run"))
local CharacterService = require(script.Parent:WaitForChild("CharacterService"))
local WaveService = require(script.Parent:WaitForChild("WaveService"))

local ShopService = {}

local function notify(player: Player, text: string, color: Color3)
	Net.event("Notify"):FireClient(player, text, color)
end

local function onBuy(player: Player, upgradeId: unknown)
	if not RateLimit.allow(player, "BuyUpgrade", 4, 6) then
		return
	end
	if not Guard.shortString(upgradeId, 32) then
		return
	end
	local upgrade = Upgrades.byId[upgradeId :: string]
	if not upgrade then
		return
	end
	local phase = GameState.phase()
	if phase ~= "Wave" and phase ~= "Shop" then
		notify(player, "A loja só abre durante a partida.", Color3.fromRGB(255, 200, 120))
		return
	end
	local run = Run.get(player)
	if not run or not run.inMatch then
		return
	end

	local level = Run.upgradeLevel(player, upgrade.id)
	if level >= upgrade.maxLevel then
		notify(player, `{upgrade.name} já está no nível máximo.`, Color3.fromRGB(255, 200, 120))
		return
	end
	if upgrade.id == "selo" and WaveService.sealIsFull() then
		notify(player, "O Selo já está com a vida cheia.", Color3.fromRGB(255, 200, 120))
		return
	end
	local cost = Upgrades.cost(upgrade, level)
	if run.coins < cost then
		notify(player, "Moedas insuficientes.", Color3.fromRGB(255, 110, 110))
		return
	end

	Run.addCoins(player, -cost)
	Run.setUpgradeLevel(player, upgrade.id, level + 1)

	if upgrade.id == "selo" then
		WaveService.healSeal(Config.SEAL_HEAL_FRACTION)
		Net.event("Notify"):FireAllClients(`{player.DisplayName} restaurou o Selo Sagrado!`, Color3.fromRGB(190, 140, 255))
	else
		CharacterService.applyStats(player)
		notify(player, `{upgrade.name} → nível {level + 1}`, Color3.fromRGB(140, 255, 160))
	end
end

function ShopService.start()
	Net.event("BuyUpgrade").OnServerEvent:Connect(onBuy)
end

return ShopService
