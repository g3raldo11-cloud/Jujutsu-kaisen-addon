--!strict
-- Interface principal: onda, Selo, chefe, vida/energia/Território,
-- barra de habilidades com recarga (também são botões no celular),
-- moedas, fragmentos, botões Pronto / Loja / Técnica e dicas de controle.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

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

local HudController = {}

type Bar = { frame: Frame, fill: Frame, text: TextLabel }

type Slot = {
	button: TextButton,
	overlay: Frame,
	timer: TextLabel,
	name: TextLabel,
	cost: TextLabel,
	stroke: UIStroke,
}

local gui: ScreenGui
local waveLabel: TextLabel
local phaseLabel: TextLabel
local sealBar: Bar
local bossBar: Bar
local healthBar: Bar
local energyBar: Bar
local ultBar: Bar
local coinsLabel: TextLabel
local fragmentsLabel: TextLabel
local techniqueLabel: TextLabel
local deadLabel: TextLabel
local controlsPanel: Frame
local readyButton: TextButton
local shopButton: TextButton
local awakenButton: TextButton
local slots: { [number]: Slot } = {}

local shown = { health = 1, energy = 1, ult = 0, seal = 1, boss = 1 }

local SLOT_KEYS = { [0] = "Clique", [1] = "Z", [2] = "X", [3] = "C", [4] = "V" }

----------------------------------------------------------------------------

local function buildTop()
	waveLabel = Ui.label({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, Ui.s(6)),
		Size = Ui.px(400, 40),
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(34),
		Text = "NOITE MALDITA",
		Parent = gui,
	})
	Ui.textStroke(0.2).Parent = waveLabel

	phaseLabel = Ui.label({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, Ui.s(44)),
		Size = Ui.px(600, 24),
		TextSize = Ui.s(18),
		TextColor3 = Ui.MUTED,
		Parent = gui,
	})
	Ui.textStroke(0.3).Parent = phaseLabel

	sealBar = Ui.bar(gui, Ui.px(380, 20), UDim2.new(0.5, 0, 0, Ui.s(74)), Vector2.new(0.5, 0), Color3.fromRGB(175, 115, 255))
	bossBar = Ui.bar(gui, Ui.px(480, 24), UDim2.new(0.5, 0, 0, Ui.s(102)), Vector2.new(0.5, 0), Color3.fromRGB(230, 40, 70))
	bossBar.frame.Visible = false

	local wallet = Ui.panel({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -Ui.s(12), 0, Ui.s(8)),
		Size = Ui.px(210, 62),
		Parent = gui,
	})
	coinsLabel = Ui.label({
		Position = Ui.px(12, 4),
		Size = Ui.px(190, 28),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.GOLD,
		TextSize = Ui.s(20),
		Font = Ui.FONT_HEAVY,
		Text = "Moedas: 0",
		Parent = wallet,
	})
	fragmentsLabel = Ui.label({
		Position = Ui.px(12, 32),
		Size = Ui.px(190, 24),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.ACCENT,
		TextSize = Ui.s(16),
		Text = "Fragmentos: 0",
		Parent = wallet,
	})
end

local function buildPlayerPanel()
	local panel = Ui.panel({
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, Ui.s(14), 1, -Ui.s(14)),
		Size = Ui.px(300, 92),
		Parent = gui,
	})
	healthBar = Ui.bar(panel, Ui.px(276, 24), Ui.px(12, 10), Vector2.zero, Color3.fromRGB(90, 220, 120))
	energyBar = Ui.bar(panel, Ui.px(276, 18), Ui.px(12, 40), Vector2.zero, Color3.fromRGB(80, 150, 255))
	ultBar = Ui.bar(panel, Ui.px(276, 18), Ui.px(12, 64), Vector2.zero, Ui.GOLD)

	if Ui.isTouch() then
		-- No celular o painel sobe para não ficar embaixo do analógico.
		panel.AnchorPoint = Vector2.new(0, 0)
		panel.Position = UDim2.new(0, Ui.s(14), 0, Ui.s(80))
	end
end

local function makeSlot(slot: number, parent: Instance, size: number): Slot
	local button = Ui.button({
		Name = "Slot" .. slot,
		Size = UDim2.fromOffset(size, size),
		BackgroundColor3 = Ui.PANEL,
		BackgroundTransparency = 0.15,
		LayoutOrder = slot,
		AutoButtonColor = true,
		Parent = parent,
	})
	local stroke = Ui.stroke(if slot == 4 then Ui.GOLD else Ui.ACCENT, 2, 0.3)
	stroke.Parent = button

	Ui.label({
		Position = UDim2.fromOffset(Ui.s(5), Ui.s(3)),
		Size = UDim2.new(1, -Ui.s(10), 0, Ui.s(16)),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextSize = Ui.s(13),
		TextColor3 = Ui.MUTED,
		Text = if Ui.isTouch() then "" else SLOT_KEYS[slot],
		ZIndex = 3,
		Parent = button,
	})
	local cost = Ui.label({
		Position = UDim2.fromOffset(Ui.s(5), Ui.s(3)),
		Size = UDim2.new(1, -Ui.s(10), 0, Ui.s(16)),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextSize = Ui.s(12),
		TextColor3 = Color3.fromRGB(120, 175, 255),
		ZIndex = 3,
		Parent = button,
	})
	local name = Ui.label({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -Ui.s(4)),
		Size = UDim2.new(1, -Ui.s(6), 0.55, 0),
		TextWrapped = true,
		TextSize = Ui.s(12),
		TextYAlignment = Enum.TextYAlignment.Bottom,
		ZIndex = 3,
		Parent = button,
	})
	Ui.textStroke(0.4).Parent = name
	local overlay = Ui.new("Frame", {
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.fromScale(0, 1),
		Size = UDim2.fromScale(1, 0),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.35,
		BorderSizePixel = 0,
		ZIndex = 4,
		Parent = button,
	})
	Ui.corner(8).Parent = overlay
	local timer = Ui.label({
		Size = UDim2.fromScale(1, 1),
		TextSize = Ui.s(24),
		Font = Ui.FONT_HEAVY,
		ZIndex = 5,
		Parent = button,
	})
	Ui.textStroke(0.2).Parent = timer

	button.Activated:Connect(function()
		ClientState.SkillRequested:Fire(slot)
	end)

	return { button = button, overlay = overlay, timer = timer, name = name, cost = cost, stroke = stroke }
end

local function buildHotbar()
	local touch = Ui.isTouch()
	local size = Ui.s(if touch then 78 else 74)
	local bar = Ui.new("Frame", {
		Name = "Hotbar",
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(size * 5 + Ui.s(8) * 4, size),
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -Ui.s(16)),
		Parent = gui,
	})
	Ui.new("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, Ui.s(8)),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Parent = bar,
	})
	if touch then
		-- Celular: grade 3x2 acima do botão de pulo, à direita.
		bar.AnchorPoint = Vector2.new(1, 1)
		bar.Position = UDim2.new(1, -Ui.s(16), 1, -Ui.s(150))
		bar.Size = UDim2.fromOffset(size * 3 + Ui.s(8) * 2, size * 2 + Ui.s(8))
		local layout = bar:FindFirstChildOfClass("UIListLayout")
		if layout then
			layout:Destroy()
		end
		Ui.new("UIGridLayout", {
			CellSize = UDim2.fromOffset(size, size),
			CellPadding = UDim2.fromOffset(Ui.s(8), Ui.s(8)),
			SortOrder = Enum.SortOrder.LayoutOrder,
			HorizontalAlignment = Enum.HorizontalAlignment.Right,
			Parent = bar,
		})
	end

	for slot = 0, 4 do
		slots[slot] = makeSlot(slot, bar, size)
	end

	-- Nome da técnica logo acima da barra (fora dela, para não entrar no layout).
	local barHeight = bar.Size.Y.Offset
	techniqueLabel = Ui.label({
		AnchorPoint = if touch then Vector2.new(1, 1) else Vector2.new(0.5, 1),
		Position = if touch
			then UDim2.new(1, -Ui.s(16), 1, -(Ui.s(150) + barHeight + Ui.s(4)))
			else UDim2.new(0.5, 0, 1, -(Ui.s(16) + barHeight + Ui.s(4))),
		Size = Ui.px(520, 24),
		TextXAlignment = if touch then Enum.TextXAlignment.Right else Enum.TextXAlignment.Center,
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(18),
		Parent = gui,
	})
	Ui.textStroke(0.2).Parent = techniqueLabel
end

local function buildButtons()
	local column = Ui.new("Frame", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -Ui.s(14), 0.45, 0),
		Size = Ui.px(170, 190),
		Parent = gui,
	})
	Ui.new("UIListLayout", {
		Padding = UDim.new(0, Ui.s(8)),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Right,
		Parent = column,
	})

	readyButton = Ui.button({
		Size = Ui.px(170, 50),
		BackgroundColor3 = Color3.fromRGB(40, 120, 70),
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(18),
		Text = "PRONTO",
		LayoutOrder = 1,
		Parent = column,
	})
	Ui.stroke(Ui.GOOD, 2, 0.3).Parent = readyButton
	readyButton.Activated:Connect(function()
		Sfx.play("ui", 0.4)
		Net.event("ToggleReady"):FireServer()
	end)

	shopButton = Ui.button({
		Size = Ui.px(170, 50),
		BackgroundColor3 = Color3.fromRGB(110, 80, 20),
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(18),
		Text = if Ui.isTouch() then "LOJA" else "LOJA [B]",
		LayoutOrder = 2,
		Parent = column,
	})
	Ui.stroke(Ui.GOLD, 2, 0.3).Parent = shopButton
	shopButton.Activated:Connect(function()
		ClientState.ToggleShop:Fire()
	end)

	awakenButton = Ui.button({
		Size = Ui.px(170, 50),
		BackgroundColor3 = Color3.fromRGB(70, 40, 120),
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(18),
		Text = if Ui.isTouch() then "TÉCNICA" else "TÉCNICA [T]",
		LayoutOrder = 3,
		Parent = column,
	})
	Ui.stroke(Ui.ACCENT, 2, 0.3).Parent = awakenButton
	awakenButton.Activated:Connect(function()
		ClientState.ToggleAwaken:Fire()
	end)
end

local function buildExtras()
	deadLabel = Ui.label({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.62),
		Size = Ui.px(700, 40),
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(24),
		TextColor3 = Ui.BAD,
		Text = "Você caiu! Volta quando a onda acabar.",
		Visible = false,
		Parent = gui,
	})
	Ui.textStroke(0.2).Parent = deadLabel

	controlsPanel = Ui.panel({
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, Ui.s(14), 0.42, 0),
		Size = Ui.px(270, 190),
		Parent = gui,
	})
	Ui.padding(12).Parent = controlsPanel
	local touch = Ui.isTouch()
	local text = if touch
		then "COMO JOGAR\n\n• Toque nos botões à direita para atacar\n• Mire: o golpe vai na maldição mais perto\n• Proteja o cristal roxo (Selo)\n• Entre as ondas, compre na LOJA"
		else "COMO JOGAR\n\nClique (segure): golpe em combo\nZ / X / C: habilidades da técnica\nV: Território (quando a barra dourada encher)\nB: loja  •  T: técnica\n\nProteja o cristal roxo (Selo Sagrado)!"
	Ui.label({
		Size = UDim2.fromScale(1, 1),
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		TextSize = Ui.s(15),
		Font = Ui.FONT_BODY,
		Text = text,
		Parent = controlsPanel,
	})
end

----------------------------------------------------------------------------

local function refreshTechnique()
	local technique = Techniques.byId[player:GetAttribute("Technique") :: string? or ""]
	if not technique then
		techniqueLabel.Text = "Despertando técnica..."
		techniqueLabel.TextColor3 = Ui.MUTED
		return
	end
	local rarity = Techniques.RARITY[technique.rarity]
	techniqueLabel.Text = `{technique.name}  •  {rarity.name}`
	techniqueLabel.TextColor3 = rarity.color
	slots[0].name.Text = "Golpe"
	for index = 1, 3 do
		local skill = technique.skills[index]
		slots[index].name.Text = skill.name
		slots[index].cost.Text = tostring(skill.cost)
		slots[index].stroke.Color = technique.color
	end
	slots[4].name.Text = "Território"
end

local function refreshWallet()
	coinsLabel.Text = "Moedas: " .. Ui.formatNumber((player:GetAttribute("Coins") :: number?) or 0)
	fragmentsLabel.Text = "Fragmentos: " .. Ui.formatNumber((player:GetAttribute("Fragments") :: number?) or 0)
end

local function refreshPhase()
	local phase = GameState.phase()
	local wave = GameState.get("Wave") :: number
	local countdown = GameState.get("Countdown") :: number
	local ready = GameState.get("ReadyCount") :: number
	local total = GameState.get("PlayerCount") :: number
	local inMatch = player:GetAttribute("InMatch") == true

	if phase == "Lobby" then
		waveLabel.Text = "NOITE MALDITA"
		phaseLabel.Text = if countdown > 0
			then `A noite começa em {countdown}s  •  prontos: {ready}/{total}`
			else "Esperando jogadores..."
	elseif phase == "Wave" then
		waveLabel.Text = `ONDA {wave}`
		phaseLabel.Text = `{GameState.get("EnemiesLeft")} maldições restantes`
	elseif phase == "Shop" then
		waveLabel.Text = `ONDA {wave} CONCLUÍDA`
		phaseLabel.Text = `Loja aberta  •  próxima onda em {countdown}s  •  prontos: {ready}/{total}`
	else
		waveLabel.Text = "FIM DA NOITE"
		phaseLabel.Text = `Nova noite em {countdown}s`
	end

	local isReady = player:GetAttribute("Ready") == true
	readyButton.Visible = phase == "Lobby" or phase == "Shop"
	readyButton.Text = if isReady then "PRONTO ✓" else "PRONTO"
	readyButton.BackgroundColor3 = if isReady then Color3.fromRGB(60, 170, 95) else Color3.fromRGB(40, 90, 60)
	shopButton.Visible = inMatch and (phase == "Wave" or phase == "Shop")
	awakenButton.Visible = phase == "Lobby" or phase == "GameOver"
	controlsPanel.Visible = phase == "Lobby"
	sealBar.frame.Visible = phase ~= "Lobby"
	coinsLabel.Visible = phase ~= "Lobby"
end

local function lerp(a: number, b: number, t: number): number
	return a + (b - a) * t
end

local function onRender(dt: number)
	local t = math.min(1, dt * 10)

	-- Vida
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local health, maxHealth = 0, 100
	if humanoid then
		health, maxHealth = humanoid.Health, math.max(1, humanoid.MaxHealth)
	end
	shown.health = lerp(shown.health, health / maxHealth, t)
	healthBar.fill.Size = UDim2.fromScale(math.clamp(shown.health, 0, 1), 1)
	healthBar.fill.BackgroundColor3 = Color3.fromRGB(230, 60, 70):Lerp(Color3.fromRGB(90, 220, 120), math.clamp(shown.health * 1.4 - 0.2, 0, 1))
	healthBar.text.Text = `Vida  {math.ceil(health)} / {math.floor(maxHealth)}`

	local alive = humanoid ~= nil and health > 0
	deadLabel.Visible = not alive and GameState.phase() == "Wave" and player:GetAttribute("InMatch") == true

	-- Energia
	local energy = (player:GetAttribute("Energy") :: number?) or 0
	local maxEnergy = (player:GetAttribute("MaxEnergy") :: number?) or Config.ENERGY_MAX
	shown.energy = lerp(shown.energy, energy / maxEnergy, t)
	energyBar.fill.Size = UDim2.fromScale(math.clamp(shown.energy, 0, 1), 1)
	energyBar.text.Text = `Energia  {energy}`

	-- Território
	local ult = (player:GetAttribute("Ult") :: number?) or 0
	shown.ult = lerp(shown.ult, ult / Config.ULT_MAX, t)
	ultBar.fill.Size = UDim2.fromScale(math.clamp(shown.ult, 0, 1), 1)
	local ultReady = ult >= Config.ULT_MAX
	if ultReady then
		local pulse = 0.5 + 0.5 * math.sin(os.clock() * 8)
		ultBar.text.Text = if Ui.isTouch() then "TERRITÓRIO PRONTO!" else "TERRITÓRIO PRONTO! [V]"
		ultBar.fill.BackgroundColor3 = Ui.GOLD:Lerp(Color3.new(1, 1, 1), pulse * 0.5)
		slots[4].stroke.Transparency = 0
		slots[4].stroke.Thickness = Ui.s(2) + pulse * Ui.s(2)
	else
		ultBar.text.Text = `Território  {math.floor(ult)}%`
		ultBar.fill.BackgroundColor3 = Ui.GOLD
		slots[4].stroke.Transparency = 0.3
		slots[4].stroke.Thickness = Ui.s(2)
	end

	-- Selo e chefe
	local seal = GameState.get("SealHealth") :: number
	local sealMax = math.max(1, GameState.get("SealMaxHealth") :: number)
	shown.seal = lerp(shown.seal, seal / sealMax, t)
	sealBar.fill.Size = UDim2.fromScale(math.clamp(shown.seal, 0, 1), 1)
	sealBar.text.Text = `Selo Sagrado  {seal} / {sealMax}`
	sealBar.fill.BackgroundColor3 = Color3.fromRGB(255, 60, 80):Lerp(Color3.fromRGB(175, 115, 255), math.clamp(seal / sealMax * 1.5 - 0.2, 0, 1))

	local bossName = GameState.get("BossName") :: string
	bossBar.frame.Visible = bossName ~= ""
	if bossName ~= "" then
		local bossHealth = GameState.get("BossHealth") :: number
		local bossMax = math.max(1, GameState.get("BossMaxHealth") :: number)
		shown.boss = lerp(shown.boss, bossHealth / bossMax, t)
		bossBar.fill.Size = UDim2.fromScale(math.clamp(shown.boss, 0, 1), 1)
		bossBar.text.Text = `{bossName}  •  {Ui.formatNumber(bossHealth)}`
	end

	-- Recargas
	local now = os.clock()
	local technique = Techniques.byId[player:GetAttribute("Technique") :: string? or ""]
	for slot = 1, 4 do
		local data = slots[slot]
		local endsAt = ClientState.cooldownEnds[slot] or 0
		local total = ClientState.cooldownTotals[slot] or 1
		local remaining = endsAt - now
		if remaining > 0 then
			data.overlay.Size = UDim2.fromScale(1, math.clamp(remaining / total, 0, 1))
			data.timer.Text = if remaining >= 10 then tostring(math.ceil(remaining)) else string.format("%.1f", remaining)
		else
			data.overlay.Size = UDim2.fromScale(1, 0)
			data.timer.Text = ""
		end
		-- Sem energia suficiente: botão escurece.
		if slot <= 3 and technique then
			local skill = technique.skills[slot]
			data.button.BackgroundColor3 = if energy >= skill.cost then Ui.PANEL else Color3.fromRGB(45, 20, 30)
		elseif slot == 4 then
			data.button.BackgroundColor3 = if ultReady then Color3.fromRGB(70, 55, 15) else Ui.PANEL
		end
	end
end

function HudController.init()
	gui = Ui.screen("HUD", 10)
	buildTop()
	buildPlayerPanel()
	buildHotbar()
	buildButtons()
	buildExtras()
end

function HudController.start()
	refreshTechnique()
	refreshWallet()
	refreshPhase()

	player:GetAttributeChangedSignal("Technique"):Connect(refreshTechnique)
	player:GetAttributeChangedSignal("Coins"):Connect(refreshWallet)
	player:GetAttributeChangedSignal("Fragments"):Connect(refreshWallet)
	player:GetAttributeChangedSignal("Ready"):Connect(refreshPhase)
	player:GetAttributeChangedSignal("InMatch"):Connect(refreshPhase)
	for _, key in { "Phase", "Wave", "Countdown", "EnemiesLeft", "ReadyCount", "PlayerCount" } do
		GameState.onChanged(key, refreshPhase)
	end

	RunService.RenderStepped:Connect(onRender)
end

return HudController
