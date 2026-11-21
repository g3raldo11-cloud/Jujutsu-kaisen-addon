--!strict
-- O "diretor" da partida:
--   Saguão (contagem / todos prontos) → Onda → Loja → Onda → ... → Fim da Noite
-- Controla o Selo Sagrado, monta cada onda, dá recompensas e fragmentos.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Enemies = require(Shared:WaitForChild("Enemies"))
local GameState = require(Shared:WaitForChild("GameState"))
local Net = require(Shared:WaitForChild("Net"))

local Util = script.Parent.Parent:WaitForChild("Util")
local RateLimit = require(Util:WaitForChild("RateLimit"))
local Run = require(Util:WaitForChild("Run"))
local CharacterService = require(script.Parent:WaitForChild("CharacterService"))
local CombatService = require(script.Parent:WaitForChild("CombatService"))
local EnemyService = require(script.Parent:WaitForChild("EnemyService"))
local MapBuilder = require(script.Parent:WaitForChild("MapBuilder"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

local WaveService = {}

local rng = Random.new()
local sealHealth = Config.SEAL_MAX_HEALTH
local lastSealAlert = 0

local GOLD = Color3.fromRGB(255, 205, 90)
local RED = Color3.fromRGB(255, 70, 80)
local PURPLE = Color3.fromRGB(190, 130, 255)

local function announce(title: string, subtitle: string, color: Color3, duration: number?)
	Net.event("Announce"):FireAllClients(title, subtitle, color, duration or 3)
end

local function notifyAll(text: string, color: Color3?)
	Net.event("Notify"):FireAllClients(text, color)
end

----------------------------------------------------------------------------
-- Selo Sagrado
----------------------------------------------------------------------------

local function setSeal(value: number)
	sealHealth = math.clamp(value, 0, Config.SEAL_MAX_HEALTH)
	GameState.set("SealHealth", math.ceil(sealHealth))
	GameState.set("SealMaxHealth", Config.SEAL_MAX_HEALTH)
	MapBuilder.setSealHealthFraction(sealHealth / Config.SEAL_MAX_HEALTH)
end

function WaveService.healSeal(fraction: number)
	setSeal(sealHealth + Config.SEAL_MAX_HEALTH * fraction)
	Net.event("Fx"):FireAllClients("sealHeal", { position = Config.SEAL_POSITION })
end

function WaveService.sealIsFull(): boolean
	return sealHealth >= Config.SEAL_MAX_HEALTH
end

----------------------------------------------------------------------------
-- Jogadores
----------------------------------------------------------------------------

local function loadedPlayers(): { Player }
	local list = {}
	for _, player in Players:GetPlayers() do
		if player:GetAttribute("DataLoaded") then
			table.insert(list, player)
		end
	end
	return list
end

local function matchPlayers(): { Player }
	local list = {}
	for _, player in Players:GetPlayers() do
		local run = Run.get(player)
		if run and run.inMatch then
			table.insert(list, player)
		end
	end
	return list
end

local function updateCounts(): (number, number)
	local loaded = loadedPlayers()
	local ready = 0
	for _, player in loaded do
		local run = Run.get(player)
		if run and run.ready then
			ready += 1
		end
	end
	GameState.set("PlayerCount", #loaded)
	GameState.set("ReadyCount", ready)
	return #loaded, ready
end

local function clearReady()
	for _, player in Players:GetPlayers() do
		Run.setReady(player, false)
	end
	updateCounts()
end

-- Contagem regressiva; se todos apertarem "Pronto", encurta.
local function countdown(seconds: number, keepGoing: () -> boolean)
	local remaining = seconds
	while remaining > 0 do
		if not keepGoing() then
			break
		end
		GameState.set("Countdown", math.ceil(remaining))
		task.wait(0.25)
		remaining -= 0.25
		local loaded, ready = updateCounts()
		if loaded > 0 and ready >= loaded and remaining > Config.READY_COUNTDOWN then
			remaining = Config.READY_COUNTDOWN
		end
	end
	GameState.set("Countdown", 0)
end

----------------------------------------------------------------------------
-- Montagem das ondas
----------------------------------------------------------------------------

local function buildWave(wave: number, playerCount: number): { string }
	local plan: { string } = {}
	local isBoss = wave % Config.BOSS_EVERY == 0
	if isBoss then
		local bossNumber = math.floor(wave / Config.BOSS_EVERY)
		table.insert(plan, if bossNumber % 2 == 1 then "devorador" else "rainha")
	end

	local total = math.floor((5 + wave * 2.2) * (1 + 0.45 * (playerCount - 1)))
	if isBoss then
		total = math.floor(total * 0.5)
	end
	for _ = 1, total do
		local roll = rng:NextNumber()
		local id = "menor"
		if wave >= 7 and roll < 0.16 then
			id = "veloz"
		elseif wave >= 3 and roll < 0.36 then
			id = "cuspidora"
		elseif wave >= 2 and roll < 0.56 then
			id = "bruta"
		end
		table.insert(plan, id)
	end
	return plan
end

local function scaling(wave: number, playerCount: number): (number, number)
	local hpMult = (1 + 0.17 * (wave - 1)) * (1 + 0.4 * (playerCount - 1))
	local dmgMult = 1 + 0.07 * (wave - 1)
	return hpMult, dmgMult
end

type Outcome = "cleared" | "sealBroken" | "allDown" | "abandoned"

local function checkLoss(): Outcome?
	if sealHealth <= 0 then
		return "sealBroken"
	end
	local inMatch = matchPlayers()
	if #inMatch == 0 then
		return "abandoned"
	end
	if CharacterService.aliveInMatch() == 0 then
		return "allDown"
	end
	return nil
end

local function runWave(wave: number): Outcome
	GameState.set("Phase", "Wave")
	GameState.set("Wave", wave)
	clearReady()

	local playerCount = math.max(1, #matchPlayers())
	local plan = buildWave(wave, playerCount)
	local hpMult, dmgMult = scaling(wave, playerCount)
	local isBoss = wave % Config.BOSS_EVERY == 0

	if isBoss then
		local bossDef = Enemies.defs[plan[1]]
		announce(`ONDA {wave}`, `Chefe: {bossDef.name}`, RED, 3.5)
	else
		announce(`ONDA {wave}`, "As maldições estão vindo!", PURPLE, 2.5)
	end

	local spawnInterval = math.max(0.3, 1.2 - wave * 0.05)
	local index = 1
	local nextSpawn = os.clock() + 1.5
	while true do
		local loss = checkLoss()
		if loss then
			return loss
		end
		local now = os.clock()
		if index <= #plan and now >= nextSpawn and EnemyService.count() < Config.MAX_ALIVE_ENEMIES then
			local portal = MapBuilder.portals[rng:NextInteger(1, #MapBuilder.portals)]
			local jitter = Vector3.new(rng:NextNumber(-6, 6), 0, rng:NextNumber(-6, 6))
			EnemyService.spawn(plan[index], portal + jitter, hpMult, dmgMult)
			index += 1
			nextSpawn = now + spawnInterval
		end
		GameState.set("EnemiesLeft", (#plan - index + 1) + EnemyService.count())
		if index > #plan and EnemyService.count() == 0 then
			GameState.set("EnemiesLeft", 0)
			return "cleared"
		end
		task.wait(0.1)
	end
end

----------------------------------------------------------------------------
-- Partida
----------------------------------------------------------------------------

local function startMatch()
	EnemyService.clearAll()
	CombatService.clearAll()
	setSeal(Config.SEAL_MAX_HEALTH)
	for _, player in loadedPlayers() do
		Run.reset(player)
		Run.setInMatch(player, true)
		CombatService.resetPlayer(player)
		task.spawn(CharacterService.spawn, player)
	end
	clearReady()
	announce("A NOITE COMEÇOU", "Proteja o Selo Sagrado no centro do templo!", PURPLE, 3.5)
	task.wait(3.5)
end

local function endMatch(outcome: Outcome, wavesCleared: number)
	GameState.set("Phase", "GameOver")
	clearReady()

	if outcome ~= "abandoned" then
		local reason = if outcome == "sealBroken" then "O Selo Sagrado foi destruído." else "Todos os feiticeiros caíram."
		announce("A NOITE VENCEU", `{reason} Vocês sobreviveram a {wavesCleared} onda(s).`, RED, 6)
	end

	local best = GameState.get("BestWave") :: number
	if wavesCleared > best then
		GameState.set("BestWave", wavesCleared)
	end

	for _, player in matchPlayers() do
		local run = Run.get(player)
		local profile = PlayerData.get(player)
		if run and profile then
			local earned = wavesCleared * Config.FRAGMENTS_PER_WAVE
				+ math.floor(run.kills / Config.FRAGMENTS_PER_KILLS)
				+ run.bossKills * Config.FRAGMENTS_PER_BOSS
			profile.fragments += earned
			profile.totalKills += run.kills
			local newRecord = wavesCleared > profile.bestWave
			if newRecord then
				profile.bestWave = wavesCleared
			end
			PlayerData.sync(player)
			local message = `+{earned} fragmentos amaldiçoados! ({run.kills} abates)`
			if newRecord then
				message ..= `  •  NOVO RECORDE: {wavesCleared} ondas!`
			end
			Net.event("Notify"):FireClient(player, message, GOLD)
		end
	end

	countdown(Config.GAME_OVER_DURATION, function()
		return true
	end)

	EnemyService.clearAll()
	CombatService.clearAll()
	setSeal(Config.SEAL_MAX_HEALTH)
	GameState.set("Wave", 0)
	GameState.set("EnemiesLeft", 0)
	for _, player in Players:GetPlayers() do
		Run.reset(player)
		CombatService.resetPlayer(player)
		if player:GetAttribute("DataLoaded") then
			task.spawn(CharacterService.spawn, player)
		end
	end
end

local function lobby()
	GameState.set("Phase", "Lobby")
	GameState.set("Wave", 0)
	clearReady()
	while true do
		while #loadedPlayers() == 0 do
			GameState.set("Countdown", 0)
			task.wait(1)
		end
		countdown(Config.LOBBY_COUNTDOWN, function()
			return #loadedPlayers() > 0
		end)
		if #loadedPlayers() > 0 then
			return
		end
	end
end

local function shop(wave: number)
	GameState.set("Phase", "Shop")
	clearReady()
	CharacterService.respawnDead()
	task.delay(1, function()
		for _, player in matchPlayers() do
			CharacterService.healFull(player)
		end
	end)
	announce(`ONDA {wave} CONCLUÍDA`, "Loja aberta! Aperte B para comprar melhorias.", GOLD, 3)
	countdown(Config.SHOP_DURATION, function()
		return #matchPlayers() > 0
	end)
end

local function gameLoop()
	while true do
		lobby()
		startMatch()
		local wave = 0
		local outcome: Outcome = "cleared"
		while true do
			wave += 1
			outcome = runWave(wave)
			if outcome ~= "cleared" then
				break
			end
			-- Recompensa por onda vencida.
			local reward = Config.WAVE_CLEAR_COINS_BASE + Config.WAVE_CLEAR_COINS_PER_WAVE * wave
			for _, player in matchPlayers() do
				Run.addCoins(player, reward)
				local run = Run.get(player)
				if run and wave % Config.BOSS_EVERY == 0 then
					run.bossKills += 1
				end
			end
			notifyAll(`+{reward} moedas para todos!`, GOLD)
			shop(wave)
			if #matchPlayers() == 0 then
				outcome = "abandoned"
				break
			end
		end
		EnemyService.clearAll()
		endMatch(outcome, wave - 1)
	end
end

----------------------------------------------------------------------------

local function onToggleReady(player: Player)
	if not RateLimit.allow(player, "ToggleReady", 3, 4) then
		return
	end
	local phase = GameState.phase()
	if phase ~= "Lobby" and phase ~= "Shop" then
		return
	end
	local run = Run.ensure(player)
	Run.setReady(player, not run.ready)
	updateCounts()
end

function WaveService.init()
	setSeal(Config.SEAL_MAX_HEALTH)
end

function WaveService.start()
	Net.event("ToggleReady").OnServerEvent:Connect(onToggleReady)

	EnemyService.SealHit:Connect(function(amount: number)
		if GameState.phase() ~= "Wave" then
			return
		end
		setSeal(sealHealth - amount)
		local now = os.clock()
		if now - lastSealAlert > 1.5 then
			lastSealAlert = now
			Net.event("Fx"):FireAllClients("sealHit", { position = Config.SEAL_POSITION })
		end
	end)

	EnemyService.Killed:Connect(function(enemy: any, killer: Player?)
		local coins: number = enemy.def.coins
		if killer and killer.Parent then
			Run.addCoins(killer, coins)
			Run.addKill(killer)
		end
		-- O resto do time ganha uma parte (jogar junto compensa).
		for _, player in matchPlayers() do
			if player ~= killer then
				Run.addCoins(player, coins * 0.3)
			end
		end
		if enemy.isBoss then
			announce("CHEFE DERROTADO!", `{enemy.def.name} foi exorcizado.`, GOLD, 3)
		end
	end)

	Players.PlayerAdded:Connect(updateCounts)
	Players.PlayerRemoving:Connect(function()
		task.defer(updateCounts)
	end)

	gameLoop()
end

return WaveService
