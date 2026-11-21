--!strict
-- Tela do Despertar: mostra a técnica atual e faz o sorteio de uma nova
-- (com animação de "roleta"). O sorteio de verdade acontece no servidor.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local GameState = require(Shared:WaitForChild("GameState"))
local Net = require(Shared:WaitForChild("Net"))
local Techniques = require(Shared:WaitForChild("Techniques"))

local ClientUtil = script.Parent.Parent:WaitForChild("Util")
local Ui = require(ClientUtil:WaitForChild("Ui"))
local ClientState = require(ClientUtil:WaitForChild("ClientState"))
local Sfx = require(ClientUtil:WaitForChild("Sfx"))

local player = Players.LocalPlayer

local AwakenController = {}

local gui: ScreenGui
local panel: Frame
local card: Frame
local cardStroke: UIStroke
local nameLabel: TextLabel
local rarityLabel: TextLabel
local descriptionLabel: TextLabel
local skillsLabel: TextLabel
local fragmentsLabel: TextLabel
local pityLabel: TextLabel
local rollButton: TextButton
local rolling = false
local openedOnce = false

local function canRoll(): boolean
	local phase = GameState.phase()
	return phase == "Lobby" or phase == "GameOver"
end

local function showTechnique(technique: any)
	local rarity = Techniques.RARITY[technique.rarity]
	nameLabel.Text = technique.name
	nameLabel.TextColor3 = technique.color:Lerp(Color3.new(1, 1, 1), 0.25)
	rarityLabel.Text = string.upper(rarity.name)
	rarityLabel.TextColor3 = rarity.color
	cardStroke.Color = rarity.color
	descriptionLabel.Text = `{technique.description}\nEfeito: {technique.effectText}`
	local lines = {}
	local keys = if Ui.isTouch() then { "1", "2", "3" } else { "Z", "X", "C" }
	for index, skill in technique.skills do
		table.insert(lines, `{keys[index]}  •  {skill.name}`)
	end
	table.insert(lines, `{if Ui.isTouch() then "★" else "V"}  •  {technique.domain.name}`)
	skillsLabel.Text = table.concat(lines, "\n")
end

local function refresh()
	if rolling then
		return
	end
	local technique = Techniques.byId[player:GetAttribute("Technique") :: string? or ""]
	if technique then
		showTechnique(technique)
	end
	local fragments = (player:GetAttribute("Fragments") :: number?) or 0
	fragmentsLabel.Text = `Fragmentos: {Ui.formatNumber(fragments)}`
	local pity = (player:GetAttribute("Pity") :: number?) or Config.PITY_ROLLS
	pityLabel.Text = if pity <= 1 then "A próxima rolagem é Épica ou melhor!" else `Épico ou melhor garantido em {pity} rolagens`
	local affordable = fragments >= Config.REROLL_COST
	rollButton.Text = `DESPERTAR NOVA TÉCNICA  ({Config.REROLL_COST} fragmentos)`
	rollButton.BackgroundColor3 = if affordable and canRoll() then Color3.fromRGB(110, 60, 190) else Color3.fromRGB(60, 50, 75)
end

local function setOpen(open: boolean)
	if open and not canRoll() then
		ClientState.Notify:Fire("Você pode trocar de técnica no saguão, entre as noites.", Color3.fromRGB(255, 200, 120))
		return
	end
	panel.Visible = open
	if open then
		refresh()
	end
end

-- Animação de roleta: troca nomes cada vez mais devagar e revela o resultado.
local function playRoll(resultId: string)
	local result = Techniques.byId[resultId]
	if not result then
		return
	end
	rolling = true
	panel.Visible = true
	local delay = 0.05
	local elapsed = 0
	while elapsed < 1.8 do
		local random = Techniques.list[math.random(1, #Techniques.list)]
		showTechnique(random)
		Sfx.play("ui", 0.25, 1.5)
		task.wait(delay)
		elapsed += delay
		delay *= 1.18
	end
	showTechnique(result)
	rolling = false
	refresh()

	local rarity = Techniques.RARITY[result.rarity]
	Sfx.play("boom", 0.6, if rarity.rank >= 3 then 0.6 else 1)
	card.BackgroundColor3 = rarity.color
	Ui.tween(card, 0.6, { BackgroundColor3 = Ui.PANEL_LIGHT })
	ClientState.Notify:Fire(`Você despertou {result.name} ({rarity.name})!`, rarity.color)
end

local function build()
	gui = Ui.screen("Awaken", 25)
	panel = Ui.panel({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = Ui.px(560, 470),
		Visible = false,
		Parent = gui,
	})
	Ui.padding(18).Parent = panel

	local title = Ui.label({
		Size = UDim2.new(1, 0, 0, Ui.s(34)),
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(28),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = "DESPERTAR",
		TextColor3 = Ui.ACCENT,
		Parent = panel,
	})
	Ui.textStroke(0.3).Parent = title

	local close = Ui.button({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = Ui.px(34, 34),
		Text = "X",
		BackgroundColor3 = Color3.fromRGB(90, 40, 50),
		Parent = panel,
	})
	close.Activated:Connect(function()
		if not rolling then
			setOpen(false)
		end
	end)

	card = Ui.new("Frame", {
		Position = UDim2.new(0, 0, 0, Ui.s(46)),
		Size = UDim2.new(1, 0, 0, Ui.s(270)),
		BackgroundColor3 = Ui.PANEL_LIGHT,
		BackgroundTransparency = 0.1,
		Parent = panel,
	})
	Ui.corner(10).Parent = card
	cardStroke = Ui.stroke(Ui.ACCENT, 2.5, 0)
	cardStroke.Parent = card
	Ui.padding(14).Parent = card

	rarityLabel = Ui.label({
		Size = UDim2.new(1, 0, 0, Ui.s(20)),
		TextXAlignment = Enum.TextXAlignment.Left,
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(16),
		Parent = card,
	})
	nameLabel = Ui.label({
		Position = UDim2.new(0, 0, 0, Ui.s(20)),
		Size = UDim2.new(1, 0, 0, Ui.s(40)),
		TextXAlignment = Enum.TextXAlignment.Left,
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(34),
		Parent = card,
	})
	Ui.textStroke(0.3).Parent = nameLabel
	descriptionLabel = Ui.label({
		Position = UDim2.new(0, 0, 0, Ui.s(66)),
		Size = UDim2.new(1, 0, 0, Ui.s(60)),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		TextWrapped = true,
		Font = Ui.FONT_BODY,
		TextSize = Ui.s(15),
		TextColor3 = Ui.MUTED,
		Parent = card,
	})
	skillsLabel = Ui.label({
		Position = UDim2.new(0, 0, 0, Ui.s(132)),
		Size = UDim2.new(1, 0, 0, Ui.s(110)),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		TextSize = Ui.s(17),
		LineHeight = 1.2,
		Parent = card,
	})

	fragmentsLabel = Ui.label({
		Position = UDim2.new(0, 0, 0, Ui.s(326)),
		Size = UDim2.new(0.5, 0, 0, Ui.s(22)),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.ACCENT,
		TextSize = Ui.s(17),
		Parent = panel,
	})
	pityLabel = Ui.label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, Ui.s(326)),
		Size = UDim2.new(0.5, 0, 0, Ui.s(22)),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextColor3 = Ui.MUTED,
		Font = Ui.FONT_BODY,
		TextSize = Ui.s(14),
		Parent = panel,
	})

	rollButton = Ui.button({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.fromScale(0.5, 1),
		Size = UDim2.new(1, 0, 0, Ui.s(56)),
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(18),
		Parent = panel,
	})
	Ui.stroke(Ui.ACCENT, 2, 0.2).Parent = rollButton
	rollButton.Activated:Connect(function()
		if rolling then
			return
		end
		if not canRoll() then
			ClientState.Notify:Fire("Só dá para despertar no saguão.", Color3.fromRGB(255, 200, 120))
			return
		end
		Sfx.play("ui", 0.5)
		Net.event("Reroll"):FireServer()
	end)
end

function AwakenController.init()
	build()
end

function AwakenController.start()
	ClientState.ToggleAwaken:Connect(function()
		setOpen(not panel.Visible)
	end)
	Net.event("RerollResult").OnClientEvent:Connect(function(techniqueId: string)
		if typeof(techniqueId) == "string" then
			playRoll(techniqueId)
		end
	end)
	for _, key in { "Technique", "Fragments", "Pity" } do
		player:GetAttributeChangedSignal(key):Connect(refresh)
	end
	GameState.onChanged("Phase", function()
		if not canRoll() and not rolling then
			panel.Visible = false
		end
		refresh()
	end)

	-- Mostra a técnica assim que ela despertar pela primeira vez.
	local function tryAutoOpen()
		if openedOnce or not canRoll() then
			return
		end
		if Techniques.byId[player:GetAttribute("Technique") :: string? or ""] then
			openedOnce = true
			setOpen(true)
			if player:GetAttribute("FirstAwaken") == true then
				ClientState.Notify:Fire("Sua técnica de feitiçaria despertou!", Ui.ACCENT)
			end
		end
	end
	player:GetAttributeChangedSignal("Technique"):Connect(tryAutoOpen)
	task.delay(1.5, tryAutoOpen)
	refresh()
end

return AwakenController
