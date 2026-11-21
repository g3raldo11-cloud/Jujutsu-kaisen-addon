--!strict
-- Sons usando arquivos que já vêm com o Roblox (rbxasset://).
-- Dica: troque pelos IDs de sons da Creator Store para um áudio melhor;
-- basta mudar os caminhos abaixo para "rbxassetid://NUMERO".

local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")

local SOUNDS: { [string]: string } = {
	slash = "rbxasset://sounds/swordslash.wav",
	shoot = "rbxasset://sounds/Rocket whoosh 01.wav",
	boom = "rbxasset://sounds/Rocket shot.wav",
	hit = "rbxasset://sounds/swordslash.wav",
	ui = "rbxasset://sounds/electronicpingshort.wav",
	hurt = "rbxasset://sounds/uuhhh.mp3",
}

local Sfx = {}

local lastPlayed: { [string]: number } = {}

function Sfx.play(name: string, volume: number?, pitch: number?, position: Vector3?)
	local id = SOUNDS[name]
	if not id then
		return
	end
	-- Evita dezenas do mesmo som no mesmo instante.
	local now = os.clock()
	if lastPlayed[name] and now - lastPlayed[name] < 0.05 then
		return
	end
	lastPlayed[name] = now

	local sound = Instance.new("Sound")
	sound.SoundId = id
	sound.Volume = volume or 0.5
	sound.PlaybackSpeed = pitch or 1

	local holder: Instance = SoundService
	if position then
		local attachment = Instance.new("Attachment")
		attachment.WorldPosition = position
		attachment.Parent = Workspace.Terrain
		sound.RollOffMaxDistance = 220
		sound.Parent = attachment
		holder = attachment
	else
		sound.Parent = SoundService
	end
	sound:Play()
	task.delay(4, function()
		if holder ~= SoundService then
			holder:Destroy()
		else
			sound:Destroy()
		end
	end)
end

return Sfx
