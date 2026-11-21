--!strict
-- Estado público da partida (fase, onda, vida do selo, chefe...).
-- Fica como Attributes numa pasta em ReplicatedStorage: o servidor escreve,
-- os clientes leem e reagem às mudanças.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

export type Phase = "Lobby" | "Wave" | "Shop" | "GameOver"

local DEFAULTS: { [string]: any } = {
	Phase = "Lobby",
	Wave = 0,
	Countdown = 0,
	EnemiesLeft = 0,
	SealHealth = 1,
	SealMaxHealth = 1,
	BossName = "",
	BossHealth = 0,
	BossMaxHealth = 1,
	ReadyCount = 0,
	PlayerCount = 0,
	BestWave = 0,
}

local folder: Instance
if RunService:IsServer() then
	local existing = ReplicatedStorage:FindFirstChild("GameState")
	if existing then
		folder = existing
	else
		local created = Instance.new("Folder")
		created.Name = "GameState"
		for key, value in DEFAULTS do
			created:SetAttribute(key, value)
		end
		created.Parent = ReplicatedStorage
		folder = created
	end
else
	folder = ReplicatedStorage:WaitForChild("GameState")
end

local GameState = {}

function GameState.get(key: string): any
	local value = folder:GetAttribute(key)
	if value == nil then
		return DEFAULTS[key]
	end
	return value
end

function GameState.set(key: string, value: any)
	folder:SetAttribute(key, value)
end

function GameState.phase(): Phase
	return GameState.get("Phase") :: Phase
end

function GameState.onChanged(key: string, callback: () -> ()): RBXScriptConnection
	return folder:GetAttributeChangedSignal(key):Connect(callback)
end

return GameState
