--!strict
-- Janela da loja entre ondas. Mostra preço e nível de cada melhoria;
-- o clique só manda o pedido — quem cobra e aplica é o servidor.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameState = require(Shared:WaitForChild("GameState"))
local Net = require(Shared:WaitForChild("Net"))
local Upgrades = require(Shared:WaitForChild("Upgrades"))

local ClientUtil = script.Parent.Parent:WaitForChild("Util")
local Ui = require(ClientUtil:WaitForChild("Ui"))
local ClientState = require(ClientUtil:WaitForChild("ClientState"))
local Sfx = require(ClientUtil:WaitForChild("Sfx"))

local player = Players.LocalPlayer

local ShopController = {}

type Row = { level: TextLabel, buy: TextButton, upgrade: any }

local gui: ScreenGui
local panel: Frame
local coinsLabel: TextLabel
local rows: { Row } = {}

local function canOpen(): boolean
	local phase = GameState.phase()
	return player:GetAttribute("InMatch") == true and (phase == "Wave" or phase == "Shop")
end

local function refresh()
	local coins = (player:GetAttribute("Coins") :: number?) or 0
	coinsLabel.Text = "Moedas: " .. Ui.formatNumber(coins)
	for _, row in rows do
		local upgrade = row.upgrade
		local level = (player:GetAttribute("Up_" .. upgrade.id) :: number?) or 0
		local maxed = level >= upgrade.maxLevel
		if upgrade.team then
			row.level.Text = "Time"
		else
			row.level.Text = `Nv {level}/{upgrade.maxLevel}`
		end
		if maxed then
			row.buy.Text = "MÁX"
			row.buy.BackgroundColor3 = Color3.fromRGB(60, 55, 70)
		else
			local cost = Upgrades.cost(upgrade, level)
			row.buy.Text = Ui.formatNumber(cost)
			row.buy.BackgroundColor3 = if coins >= cost then Color3.fromRGB(45, 140, 75) else Color3.fromRGB(90, 40, 50)
		end
	end
end

local function setOpen(open: boolean)
	if open and not canOpen() then
		ClientState.Notify:Fire("A loja abre quando a partida começa.", Color3.fromRGB(255, 200, 120))
		return
	end
	panel.Visible = open
	if open then
		refresh()
	end
end

local function build()
	gui = Ui.screen("Shop", 20)
	panel = Ui.panel({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = Ui.px(520, 470),
		Visible = false,
		Parent = gui,
	})
	Ui.padding(16).Parent = panel

	local title = Ui.label({
		Size = UDim2.new(1, 0, 0, Ui.s(34)),
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(28),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = "LOJA DO TEMPLO",
		TextColor3 = Ui.GOLD,
		Parent = panel,
	})
	Ui.textStroke(0.3).Parent = title

	coinsLabel = Ui.label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -Ui.s(44), 0, 0),
		Size = Ui.px(200, 34),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextColor3 = Ui.GOLD,
		TextSize = Ui.s(20),
		Parent = panel,
	})

	local close = Ui.button({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = Ui.px(34, 34),
		Text = "X",
		BackgroundColor3 = Color3.fromRGB(90, 40, 50),
		Parent = panel,
	})
	close.Activated:Connect(function()
		setOpen(false)
	end)

	local list = Ui.new("ScrollingFrame", {
		Position = UDim2.new(0, 0, 0, Ui.s(46)),
		Size = UDim2.new(1, 0, 1, -Ui.s(46)),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = Ui.s(6),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		Parent = panel,
	})
	Ui.new("UIListLayout", {
		Padding = UDim.new(0, Ui.s(8)),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = list,
	})

	for index, upgrade in Upgrades.list do
		local row = Ui.new("Frame", {
			Size = UDim2.new(1, -Ui.s(10), 0, Ui.s(62)),
			BackgroundColor3 = Ui.PANEL_LIGHT,
			BackgroundTransparency = 0.2,
			LayoutOrder = index,
			Parent = list,
		})
		Ui.corner(8).Parent = row
		Ui.label({
			Position = Ui.px(12, 6),
			Size = UDim2.new(1, -Ui.s(200), 0, Ui.s(24)),
			TextXAlignment = Enum.TextXAlignment.Left,
			Font = Ui.FONT_HEAVY,
			TextSize = Ui.s(19),
			Text = upgrade.name,
			Parent = row,
		})
		Ui.label({
			Position = Ui.px(12, 32),
			Size = UDim2.new(1, -Ui.s(200), 0, Ui.s(22)),
			TextXAlignment = Enum.TextXAlignment.Left,
			Font = Ui.FONT_BODY,
			TextSize = Ui.s(14),
			TextColor3 = Ui.MUTED,
			Text = upgrade.description,
			Parent = row,
		})
		local level = Ui.label({
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -Ui.s(120), 0.5, 0),
			Size = Ui.px(70, 24),
			TextSize = Ui.s(15),
			TextColor3 = Ui.ACCENT,
			Parent = row,
		})
		local buy = Ui.button({
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -Ui.s(10), 0.5, 0),
			Size = Ui.px(100, 42),
			Font = Ui.FONT_HEAVY,
			TextSize = Ui.s(18),
			Parent = row,
		})
		buy.Activated:Connect(function()
			Sfx.play("ui", 0.4)
			Net.event("BuyUpgrade"):FireServer(upgrade.id)
		end)
		table.insert(rows, { level = level, buy = buy, upgrade = upgrade })
	end
end

function ShopController.init()
	build()
end

function ShopController.start()
	ClientState.ToggleShop:Connect(function()
		setOpen(not panel.Visible)
	end)
	player:GetAttributeChangedSignal("Coins"):Connect(refresh)
	for _, upgrade in Upgrades.list do
		player:GetAttributeChangedSignal("Up_" .. upgrade.id):Connect(refresh)
	end
	GameState.onChanged("Phase", function()
		local phase = GameState.phase()
		if phase == "Shop" and player:GetAttribute("InMatch") == true then
			setOpen(true)
		elseif phase ~= "Shop" then
			panel.Visible = false
		end
	end)
	refresh()
end

return ShopController
