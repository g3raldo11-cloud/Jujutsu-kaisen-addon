--!strict
-- Estado compartilhado entre os controladores do cliente (sem _G).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Signal = require(Shared:WaitForChild("Util"):WaitForChild("Signal"))

local ClientState = {
	-- Fim da recarga de cada slot (os.clock) e duração total, para a barra.
	cooldownEnds = {} :: { [number]: number },
	cooldownTotals = {} :: { [number]: number },

	SkillRequested = Signal.new(), -- (slot) — botões na tela (celular)
	ToggleShop = Signal.new(), -- ()
	ToggleAwaken = Signal.new(), -- ()
	Notify = Signal.new(), -- (text, color)
}

return ClientState
