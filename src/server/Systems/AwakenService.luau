--!strict
-- Despertar: sorteio da técnica de feitiçaria.
-- A primeira técnica é grátis. Trocar custa fragmentos (ganhos jogando).
-- "Pena": a cada PITY_ROLLS rolagens sem Épico/Lendário, o próximo é garantido.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local GameState = require(Shared:WaitForChild("GameState"))
local Net = require(Shared:WaitForChild("Net"))
local Techniques = require(Shared:WaitForChild("Techniques"))

local Util = script.Parent.Parent:WaitForChild("Util")
local RateLimit = require(Util:WaitForChild("RateLimit"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

local AwakenService = {}

local rng = Random.new()

local function roll(profile: any): any
	local guaranteed = profile.rollsSinceEpic >= Config.PITY_ROLLS - 1
	local technique = Techniques.roll(rng, if guaranteed then 3 else 1)
	if Techniques.RARITY[technique.rarity].rank >= 3 then
		profile.rollsSinceEpic = 0
	else
		profile.rollsSinceEpic += 1
	end
	return technique
end

local function onReroll(player: Player)
	if not RateLimit.allow(player, "Reroll", 1, 2) then
		return
	end
	local phase = GameState.phase()
	if phase ~= "Lobby" and phase ~= "GameOver" then
		Net.event("Notify"):FireClient(player, "Só dá para despertar uma nova técnica no saguão.", Color3.fromRGB(255, 200, 120))
		return
	end
	local profile = PlayerData.get(player)
	if not profile then
		return
	end
	if profile.fragments < Config.REROLL_COST then
		Net.event("Notify"):FireClient(player, "Fragmentos insuficientes. Jogue partidas para ganhar mais!", Color3.fromRGB(255, 110, 110))
		return
	end

	profile.fragments -= Config.REROLL_COST
	local technique = roll(profile)
	profile.technique = technique.id
	PlayerData.sync(player)
	Net.event("RerollResult"):FireClient(player, technique.id)

	if technique.rarity == "lendario" then
		-- Espera a animação do sorteio terminar antes de contar para todos.
		task.delay(2.2, function()
			Net.event("Announce"):FireAllClients(
				"DESPERTAR LENDÁRIO",
				`{player.DisplayName} despertou {technique.name}!`,
				Techniques.RARITY.lendario.color,
				3
			)
		end)
	end
end

local function ensureTechnique(player: Player, profile: any)
	if not Techniques.byId[profile.technique] then
		-- Primeira vez: técnica grátis.
		profile.technique = roll(profile).id
		PlayerData.sync(player)
		player:SetAttribute("FirstAwaken", true)
	end
end

function AwakenService.start()
	PlayerData.Loaded:Connect(ensureTechnique)
	-- Jogadores que carregaram antes deste sistema começar.
	for _, player in Players:GetPlayers() do
		local profile = PlayerData.get(player)
		if profile then
			ensureTechnique(player, profile)
		end
	end
	Net.event("Reroll").OnServerEvent:Connect(onReroll)
end

return AwakenService
