--!strict
-- Progresso permanente do jogador (fragmentos, técnica, recorde de onda).
-- Usa DataStore com: UpdateAsync, tentativas com espera crescente, trava de
-- sessão (evita duplicação entre servidores), salvamento automático,
-- salvamento ao sair e ao desligar o servidor (BindToClose).

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Signal = require(Shared:WaitForChild("Util"):WaitForChild("Signal"))

export type Profile = {
	version: number,
	fragments: number,
	technique: string,
	bestWave: number,
	totalKills: number,
	rollsSinceEpic: number,
	lock: { jobId: string, time: number }?,
}

local CURRENT_VERSION = 1
local LOCK_STALE_SECONDS = Config.AUTOSAVE_INTERVAL * 2 + 60
local SERVER_ID = if game.JobId ~= "" then game.JobId else "studio-" .. HttpService:GenerateGUID(false)

local PlayerData = {}
PlayerData.Loaded = Signal.new() -- (player, profile)

local profiles: { [Player]: Profile } = {}
local saveEnabled: { [Player]: boolean } = {}
local store: DataStore? = nil

local function defaultProfile(): Profile
	return {
		version = CURRENT_VERSION,
		fragments = Config.STARTING_FRAGMENTS,
		technique = "",
		bestWave = 0,
		totalKills = 0,
		rollsSinceEpic = 0,
	}
end

-- Preenche campos que faltam (dados antigos) e aplica migrações futuras.
local function reconcile(raw: any): Profile
	local profile = defaultProfile()
	if typeof(raw) == "table" then
		for key, value in raw do
			if (profile :: any)[key] ~= nil and typeof(value) == typeof((profile :: any)[key]) then
				(profile :: any)[key] = value
			end
		end
		if typeof(raw.lock) == "table" then
			profile.lock = raw.lock
		end
	end
	profile.version = CURRENT_VERSION
	return profile
end

local function keyFor(player: Player): string
	return "player_" .. player.UserId
end

local function withRetry(attempts: number, callback: () -> ()): (boolean, string?)
	local delaySeconds = 1
	local lastError: string? = nil
	for attempt = 1, attempts do
		local ok, err = pcall(callback)
		if ok then
			return true, nil
		end
		lastError = tostring(err)
		warn(`[PlayerData] tentativa {attempt}/{attempts} falhou: {err}`)
		if attempt < attempts then
			task.wait(delaySeconds)
			delaySeconds = math.min(delaySeconds * 2, 8)
		end
	end
	return false, lastError
end

type LoadStatus = "ok" | "locked" | "error"

local function claim(player: Player): (LoadStatus, Profile?)
	local dataStore = store
	if not dataStore then
		return "error", nil
	end
	local status: LoadStatus = "error"
	local loaded: Profile? = nil
	local ok = withRetry(3, function()
		dataStore:UpdateAsync(keyFor(player), function(old: any)
			local lock = if typeof(old) == "table" then old.lock else nil
			if
				typeof(lock) == "table"
				and lock.jobId ~= SERVER_ID
				and typeof(lock.time) == "number"
				and os.time() - lock.time < LOCK_STALE_SECONDS
			then
				status = "locked"
				return nil -- não escreve nada
			end
			local profile = reconcile(old)
			profile.lock = { jobId = SERVER_ID, time = os.time() }
			status = "ok"
			loaded = profile
			return profile
		end)
	end)
	if not ok then
		return "error", nil
	end
	return status, loaded
end

local function save(player: Player, release: boolean): boolean
	local profile = profiles[player]
	local dataStore = store
	if not profile or not dataStore or not saveEnabled[player] then
		return false
	end
	local ok = withRetry(3, function()
		dataStore:UpdateAsync(keyFor(player), function(old: any)
			local lock = if typeof(old) == "table" then old.lock else nil
			if typeof(lock) == "table" and lock.jobId ~= SERVER_ID then
				return nil -- outro servidor assumiu; não sobrescreve
			end
			local copy = table.clone(profile)
			copy.lock = if release then nil else { jobId = SERVER_ID, time = os.time() }
			return copy
		end)
	end)
	return ok
end

local function syncAttributes(player: Player, profile: Profile)
	player:SetAttribute("Fragments", profile.fragments)
	player:SetAttribute("Technique", profile.technique)
	player:SetAttribute("BestWave", profile.bestWave)
	player:SetAttribute("TotalKills", profile.totalKills)
	player:SetAttribute("Pity", math.max(0, Config.PITY_ROLLS - profile.rollsSinceEpic))
	local leaderstats = player:FindFirstChild("leaderstats")
	local best = leaderstats and leaderstats:FindFirstChild("Recorde")
	if best and best:IsA("IntValue") then
		best.Value = profile.bestWave
	end
end

local function onPlayerAdded(player: Player)
	local profile: Profile? = nil
	local enabled = true

	if store then
		for attempt = 1, 5 do
			local status, loaded = claim(player)
			if status == "ok" then
				profile = loaded
				break
			elseif status == "locked" then
				-- Outro servidor ainda está salvando este jogador; espera um pouco.
				task.wait(3)
			else
				break
			end
			if not player.Parent then
				return
			end
		end
	end

	if not player.Parent then
		return
	end

	if not profile then
		if RunService:IsStudio() then
			warn(
				"[PlayerData] DataStore indisponível no Studio — usando perfil temporário (não será salvo). "
					.. "Para testar o salvamento: Game Settings > Security > Enable Studio Access to API Services."
			)
			profile = defaultProfile()
			enabled = false
		else
			player:Kick("Não foi possível carregar seus dados agora. Por favor, entre de novo em instantes.")
			return
		end
	end

	local finalProfile = profile :: Profile
	profiles[player] = finalProfile
	saveEnabled[player] = enabled
	player:SetAttribute("DataLoaded", true)
	syncAttributes(player, finalProfile)
	PlayerData.Loaded:Fire(player, finalProfile)
end

function PlayerData.get(player: Player): Profile?
	return profiles[player]
end

-- Espera o perfil carregar (ou o jogador sair).
function PlayerData.waitFor(player: Player): Profile?
	while player.Parent and not profiles[player] do
		task.wait(0.2)
	end
	return profiles[player]
end

-- Chame depois de mudar o perfil, para atualizar a interface.
function PlayerData.sync(player: Player)
	local profile = profiles[player]
	if profile then
		syncAttributes(player, profile)
	end
end

function PlayerData.init()
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Config.DATASTORE_NAME)
	end)
	if ok then
		store = result
	else
		warn("[PlayerData] DataStore indisponível: " .. tostring(result))
	end
end

function PlayerData.start()
	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	Players.PlayerRemoving:Connect(function(player)
		save(player, true)
		profiles[player] = nil
		saveEnabled[player] = nil
	end)

	game:BindToClose(function()
		if RunService:IsStudio() then
			-- No Studio, salva rapidinho sem segurar o fim do teste.
			for player in profiles do
				task.spawn(save, player, true)
			end
			return
		end
		local pending = 0
		for player in profiles do
			pending += 1
			task.spawn(function()
				save(player, true)
				pending -= 1
			end)
		end
		local started = os.clock()
		while pending > 0 and os.clock() - started < 25 do
			task.wait(0.2)
		end
	end)

	-- Salvamento automático, espalhado entre os jogadores.
	while true do
		task.wait(Config.AUTOSAVE_INTERVAL)
		local list = {}
		for player in profiles do
			table.insert(list, player)
		end
		for index, player in list do
			task.delay((index - 1) * 2, function()
				if profiles[player] then
					save(player, false)
				end
			end)
		end
	end
end

return PlayerData
