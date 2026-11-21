--!strict
-- Personagens dos jogadores: aparecer no templo, aplicar melhorias
-- (vida, velocidade), brilho da técnica e regras de reviver.
-- Durante uma onda, quem morre só volta quando a onda termina.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local GameState = require(Shared:WaitForChild("GameState"))
local Net = require(Shared:WaitForChild("Net"))
local Signal = require(Shared:WaitForChild("Util"):WaitForChild("Signal"))
local Techniques = require(Shared:WaitForChild("Techniques"))

local Util = script.Parent.Parent:WaitForChild("Util")
local Run = require(Util:WaitForChild("Run"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

local CharacterService = {}
CharacterService.Died = Signal.new() -- (player)

local spawning: { [Player]: boolean } = {}

local function getHumanoid(player: Player): Humanoid?
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	return humanoid
end

function CharacterService.getRoot(player: Player): BasePart?
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root
	end
	return nil
end

function CharacterService.isAlive(player: Player): boolean
	local humanoid = getHumanoid(player)
	return humanoid ~= nil and humanoid.Health > 0 and CharacterService.getRoot(player) ~= nil
end

function CharacterService.getHumanoid(player: Player): Humanoid?
	return getHumanoid(player)
end

function CharacterService.aliveInMatch(): number
	local count = 0
	for _, player in Players:GetPlayers() do
		local run = Run.get(player)
		if run and run.inMatch and CharacterService.isAlive(player) then
			count += 1
		end
	end
	return count
end

-- Brilho na cor da técnica (fica bonito à noite).
local function applyAura(player: Player)
	local root = CharacterService.getRoot(player)
	if not root then
		return
	end
	local technique = Techniques.byId[player:GetAttribute("Technique") :: string? or ""]
	local color = if technique then technique.color else Color3.fromRGB(200, 200, 255)
	local light = root:FindFirstChild("AuraLight")
	if not light then
		local created = Instance.new("PointLight")
		created.Name = "AuraLight"
		created.Range = 12
		created.Brightness = 1.2
		created.Shadows = false
		created.Parent = root
		light = created
	end
	(light :: PointLight).Color = color
end

function CharacterService.applyStats(player: Player)
	local humanoid = getHumanoid(player)
	if not humanoid or humanoid.Health <= 0 then
		return
	end
	local newMax = Run.maxHealth(player)
	local gained = newMax - humanoid.MaxHealth
	humanoid.MaxHealth = newMax
	if gained > 0 then
		humanoid.Health = math.min(newMax, humanoid.Health + gained)
	end
	humanoid.WalkSpeed = Run.walkSpeed(player)
	applyAura(player)
end

function CharacterService.heal(player: Player, amount: number)
	local humanoid = getHumanoid(player)
	if humanoid and humanoid.Health > 0 then
		humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + amount)
	end
end

function CharacterService.healFull(player: Player)
	local humanoid = getHumanoid(player)
	if humanoid and humanoid.Health > 0 then
		humanoid.Health = humanoid.MaxHealth
	end
end

function CharacterService.spawn(player: Player)
	if spawning[player] or not player.Parent then
		return
	end
	spawning[player] = true
	local ok, err = pcall(function()
		player:LoadCharacter()
	end)
	spawning[player] = nil
	if not ok then
		warn(`[CharacterService] falha ao criar personagem de {player.Name}: {err}`)
	end
end

function CharacterService.respawnDead()
	for _, player in Players:GetPlayers() do
		if player:GetAttribute("DataLoaded") and not CharacterService.isAlive(player) then
			task.spawn(CharacterService.spawn, player)
		end
	end
end

local function onCharacterAdded(player: Player, character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10)
	if not humanoid or not humanoid:IsA("Humanoid") then
		return
	end
	humanoid.MaxHealth = Run.maxHealth(player)
	humanoid.Health = humanoid.MaxHealth
	humanoid.WalkSpeed = Run.walkSpeed(player)
	character:WaitForChild("HumanoidRootPart", 10)
	applyAura(player)

	humanoid.Died:Connect(function()
		CharacterService.Died:Fire(player)
		local phase = GameState.phase()
		local run = Run.get(player)
		if phase == "Wave" and run and run.inMatch then
			Net.event("Notify"):FireAllClients(`{player.DisplayName} caiu! Volta no fim da onda.`, Color3.fromRGB(255, 110, 110))
			return
		end
		task.wait(Config.RESPAWN_DELAY)
		if player.Parent and GameState.phase() ~= "Wave" and not CharacterService.isAlive(player) then
			CharacterService.spawn(player)
		end
	end)
end

local function onPlayerAdded(player: Player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	local kills = Instance.new("IntValue")
	kills.Name = "Abates"
	kills.Parent = leaderstats
	local best = Instance.new("IntValue")
	best.Name = "Recorde"
	best.Parent = leaderstats
	leaderstats.Parent = player

	Run.ensure(player)

	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)

	local profile = PlayerData.waitFor(player)
	if not profile or not player.Parent then
		return
	end
	PlayerData.sync(player)

	-- Entra num jogo em andamento? Ganha moedas para alcançar o time.
	local phase = GameState.phase()
	if phase == "Wave" or phase == "Shop" then
		Run.setInMatch(player, true)
		Run.addCoins(player, Config.LATE_JOIN_COINS_PER_WAVE * (GameState.get("Wave") :: number))
	end

	if phase ~= "Wave" then
		CharacterService.spawn(player)
	else
		Net.event("Notify"):FireClient(player, "Uma onda está acontecendo. Você entra quando ela acabar!", Color3.fromRGB(255, 220, 120))
	end
end

function CharacterService.init()
	Players.CharacterAutoLoads = false
end

function CharacterService.start()
	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	-- A técnica mudou (Despertar)? Atualiza o brilho.
	local function watchTechnique(player: Player)
		player:GetAttributeChangedSignal("Technique"):Connect(function()
			applyAura(player)
		end)
	end
	Players.PlayerAdded:Connect(watchTechnique)
	for _, player in Players:GetPlayers() do
		watchTechnique(player)
	end

	Players.PlayerRemoving:Connect(function(player)
		spawning[player] = nil
	end)
end

return CharacterService
