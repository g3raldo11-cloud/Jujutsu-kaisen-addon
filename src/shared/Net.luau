--!strict
-- Todos os RemoteEvents do jogo, definidos em UM lugar.
-- O servidor cria; o cliente só espera por eles.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

export type RemoteName =
	"UseSkill" -- C→S  (slot: number, aim: Vector3)
	| "SkillResult" -- S→C  (slot: number, cooldown: number, extra: {[string]: any}?)
	| "Fx" -- S→C  (kind: string, data: {[string]: any})
	| "BuyUpgrade" -- C→S  (upgradeId: string)
	| "Reroll" -- C→S  ()
	| "RerollResult" -- S→C  (techniqueId: string)
	| "ToggleReady" -- C→S  ()
	| "Announce" -- S→C  (title: string, subtitle: string, color: Color3, duration: number)
	| "Notify" -- S→C  (text: string, color: Color3?)

local NAMES: { RemoteName } = {
	"UseSkill",
	"SkillResult",
	"Fx",
	"BuyUpgrade",
	"Reroll",
	"RerollResult",
	"ToggleReady",
	"Announce",
	"Notify",
}

local IS_SERVER = RunService:IsServer()

local folder: Instance
if IS_SERVER then
	local existing = ReplicatedStorage:FindFirstChild("Remotes")
	if existing then
		folder = existing
	else
		local created = Instance.new("Folder")
		created.Name = "Remotes"
		for _, name in NAMES do
			local remote = Instance.new("RemoteEvent")
			remote.Name = name
			remote.Parent = created
		end
		created.Parent = ReplicatedStorage
		folder = created
	end
else
	folder = ReplicatedStorage:WaitForChild("Remotes")
end

local Net = {}

function Net.event(name: RemoteName): RemoteEvent
	local remote = if IS_SERVER then folder:FindFirstChild(name) else folder:WaitForChild(name)
	assert(remote and remote:IsA("RemoteEvent"), `Remote {name} não encontrado`)
	return remote
end

return Net
