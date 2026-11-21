--!strict
-- Avisos grandes no meio da tela ("ONDA 5", "CHEFE DERROTADO!") e
-- mensagens pequenas empilhadas ("+30 moedas", "Moedas insuficientes").

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared:WaitForChild("Net"))

local ClientUtil = script.Parent.Parent:WaitForChild("Util")
local Ui = require(ClientUtil:WaitForChild("Ui"))
local ClientState = require(ClientUtil:WaitForChild("ClientState"))
local Sfx = require(ClientUtil:WaitForChild("Sfx"))

local AnnouncerController = {}

type Announcement = { title: string, subtitle: string, color: Color3, duration: number }

local gui: ScreenGui
local banner: Frame
local titleLabel: TextLabel
local subtitleLabel: TextLabel
local toastList: Frame
local queue: { Announcement } = {}
local showing = false

local function setBannerTransparency(value: number, time: number)
	local info = TweenInfo.new(time, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(titleLabel, info, { TextTransparency = value }):Play()
	TweenService:Create(subtitleLabel, info, { TextTransparency = value }):Play()
	for _, label in { titleLabel, subtitleLabel } do
		local stroke = label:FindFirstChildOfClass("UIStroke")
		if stroke then
			TweenService:Create(stroke, info, { Transparency = math.max(value, 0.2) }):Play()
		end
	end
end

local function showNext()
	if showing then
		return
	end
	local item = table.remove(queue, 1)
	if not item then
		return
	end
	showing = true
	titleLabel.Text = item.title
	titleLabel.TextColor3 = item.color
	subtitleLabel.Text = item.subtitle
	banner.Position = UDim2.fromScale(0.5, 0.24)
	titleLabel.TextSize = Ui.s(70)
	TweenService:Create(titleLabel, TweenInfo.new(0.35, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { TextSize = Ui.s(54) }):Play()
	setBannerTransparency(0, 0.25)
	Sfx.play("ui", 0.4, 0.7)
	task.delay(item.duration, function()
		setBannerTransparency(1, 0.4)
		task.wait(0.45)
		showing = false
		showNext()
	end)
end

function AnnouncerController.announce(title: string, subtitle: string, color: Color3, duration: number)
	-- Se a fila crescer demais, descarta os mais antigos.
	if #queue >= 3 then
		table.remove(queue, 1)
	end
	table.insert(queue, { title = title, subtitle = subtitle, color = color, duration = duration })
	showNext()
end

function AnnouncerController.toast(text: string, color: Color3?)
	local label = Ui.label({
		Size = UDim2.new(1, 0, 0, Ui.s(28)),
		Text = text,
		TextColor3 = color or Ui.TEXT,
		TextSize = Ui.s(19),
		Font = Ui.FONT_HEAVY,
		LayoutOrder = math.floor(os.clock() * 1000),
		Parent = toastList,
	})
	local stroke = Ui.textStroke(0.2)
	stroke.Parent = label
	local children = {}
	for _, child in toastList:GetChildren() do
		if child:IsA("TextLabel") then
			table.insert(children, child)
		end
	end
	if #children > 4 then
		table.sort(children, function(a, b)
			return a.LayoutOrder < b.LayoutOrder
		end)
		children[1]:Destroy()
	end
	task.delay(2.6, function()
		if label.Parent then
			TweenService:Create(label, TweenInfo.new(0.5), { TextTransparency = 1 }):Play()
			TweenService:Create(stroke, TweenInfo.new(0.5), { Transparency = 1 }):Play()
			task.wait(0.55)
			label:Destroy()
		end
	end)
end

function AnnouncerController.init()
	gui = Ui.screen("Announcer", 30)
	banner = Ui.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.24),
		Size = UDim2.new(0.9, 0, 0, Ui.s(110)),
		BackgroundTransparency = 1,
		Parent = gui,
	})
	titleLabel = Ui.label({
		Size = UDim2.new(1, 0, 0, Ui.s(64)),
		Font = Ui.FONT_HEAVY,
		TextSize = Ui.s(54),
		TextTransparency = 1,
		Parent = banner,
	})
	Ui.textStroke(1).Parent = titleLabel
	subtitleLabel = Ui.label({
		Position = UDim2.new(0, 0, 0, Ui.s(66)),
		Size = UDim2.new(1, 0, 0, Ui.s(30)),
		TextSize = Ui.s(22),
		TextWrapped = true,
		TextTransparency = 1,
		Parent = banner,
	})
	Ui.textStroke(1).Parent = subtitleLabel

	toastList = Ui.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -Ui.s(if Ui.isTouch() then 40 else 150)),
		Size = UDim2.new(0.8, 0, 0, Ui.s(160)),
		BackgroundTransparency = 1,
		Parent = gui,
	})
	Ui.new("UIListLayout", {
		SortOrder = Enum.SortOrder.LayoutOrder,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Padding = UDim.new(0, Ui.s(2)),
		Parent = toastList,
	})
end

function AnnouncerController.start()
	Net.event("Announce").OnClientEvent:Connect(function(title: string, subtitle: string, color: Color3, duration: number)
		if typeof(title) == "string" and typeof(subtitle) == "string" then
			AnnouncerController.announce(
				title,
				subtitle,
				if typeof(color) == "Color3" then color else Ui.TEXT,
				if typeof(duration) == "number" then math.clamp(duration, 0.5, 10) else 3
			)
		end
	end)
	Net.event("Notify").OnClientEvent:Connect(function(text: string, color: Color3?)
		if typeof(text) == "string" then
			AnnouncerController.toast(text, if typeof(color) == "Color3" then color else nil)
		end
	end)
	ClientState.Notify:Connect(function(text: string, color: Color3?)
		AnnouncerController.toast(text, color)
	end)
end

return AnnouncerController
