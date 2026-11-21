--!strict
-- Ajudantes para montar a interface por código.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Ui = {}

Ui.PANEL = Color3.fromRGB(16, 12, 28)
Ui.PANEL_LIGHT = Color3.fromRGB(34, 26, 54)
Ui.ACCENT = Color3.fromRGB(175, 115, 255)
Ui.GOLD = Color3.fromRGB(255, 205, 90)
Ui.TEXT = Color3.fromRGB(240, 236, 255)
Ui.MUTED = Color3.fromRGB(170, 160, 195)
Ui.GOOD = Color3.fromRGB(110, 220, 130)
Ui.BAD = Color3.fromRGB(255, 90, 100)

Ui.FONT = Enum.Font.GothamBold
Ui.FONT_HEAVY = Enum.Font.GothamBlack
Ui.FONT_BODY = Enum.Font.Gotham

-- Escala para telas pequenas (celular) e grandes.
local function computeScale(): number
	local camera = Workspace.CurrentCamera
	local height = if camera then camera.ViewportSize.Y else 800
	local started = os.clock()
	while height < 10 and os.clock() - started < 3 do
		task.wait()
		camera = Workspace.CurrentCamera
		height = if camera then camera.ViewportSize.Y else 800
	end
	if height < 10 then
		height = 800
	end
	return math.clamp(height / 860, 0.55, 1.15)
end

Ui.scale = computeScale()

function Ui.isTouch(): boolean
	return UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
end

function Ui.s(value: number): number
	return math.floor(value * Ui.scale + 0.5)
end

function Ui.px(x: number, y: number): UDim2
	return UDim2.fromOffset(Ui.s(x), Ui.s(y))
end

function Ui.new(className: string, props: { [string]: any }?, children: { Instance }?): any
	local instance = Instance.new(className) :: any
	local parent = nil
	if props then
		for key, value in props do
			if key == "Parent" then
				parent = value
			else
				instance[key] = value
			end
		end
	end
	if children then
		for _, child in children do
			child.Parent = instance
		end
	end
	if parent then
		instance.Parent = parent
	end
	return instance
end

function Ui.corner(radius: number): UICorner
	return Ui.new("UICorner", { CornerRadius = UDim.new(0, Ui.s(radius)) })
end

function Ui.stroke(color: Color3, thickness: number, transparency: number?): UIStroke
	return Ui.new("UIStroke", {
		Color = color,
		Thickness = math.max(1, Ui.s(thickness)),
		Transparency = transparency or 0,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

function Ui.textStroke(transparency: number?): UIStroke
	return Ui.new("UIStroke", {
		Color = Color3.new(0, 0, 0),
		Thickness = math.max(1, Ui.s(2)),
		Transparency = transparency or 0.3,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual,
	})
end

function Ui.padding(pixels: number): UIPadding
	local p = UDim.new(0, Ui.s(pixels))
	return Ui.new("UIPadding", { PaddingTop = p, PaddingBottom = p, PaddingLeft = p, PaddingRight = p })
end

function Ui.gradient(top: Color3, bottom: Color3): UIGradient
	return Ui.new("UIGradient", { Color = ColorSequence.new(top, bottom), Rotation = 90 })
end

function Ui.screen(name: string, displayOrder: number): ScreenGui
	local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
	local existing = playerGui:FindFirstChild(name)
	if existing then
		existing:Destroy()
	end
	return Ui.new("ScreenGui", {
		Name = name,
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		DisplayOrder = displayOrder,
		IgnoreGuiInset = false,
		Parent = playerGui,
	})
end

function Ui.label(props: { [string]: any }): TextLabel
	local defaults: { [string]: any } = {
		BackgroundTransparency = 1,
		Font = Ui.FONT,
		TextColor3 = Ui.TEXT,
		TextSize = Ui.s(18),
		Text = "",
	}
	for key, value in props do
		defaults[key] = value
	end
	return Ui.new("TextLabel", defaults)
end

function Ui.button(props: { [string]: any }): TextButton
	local defaults: { [string]: any } = {
		BackgroundColor3 = Ui.PANEL_LIGHT,
		Font = Ui.FONT,
		TextColor3 = Ui.TEXT,
		TextSize = Ui.s(18),
		AutoButtonColor = true,
		Text = "",
	}
	for key, value in props do
		defaults[key] = value
	end
	local button = Ui.new("TextButton", defaults)
	Ui.corner(8).Parent = button
	return button
end

function Ui.panel(props: { [string]: any }): Frame
	local defaults: { [string]: any } = {
		BackgroundColor3 = Ui.PANEL,
		BackgroundTransparency = 0.15,
		BorderSizePixel = 0,
	}
	for key, value in props do
		defaults[key] = value
	end
	local frame = Ui.new("Frame", defaults)
	Ui.corner(12).Parent = frame
	Ui.stroke(Ui.ACCENT, 1.5, 0.5).Parent = frame
	return frame
end

export type Bar = { frame: Frame, fill: Frame, text: TextLabel }

-- Barra de progresso com texto por cima.
function Ui.bar(parent: Instance, size: UDim2, position: UDim2, anchor: Vector2, color: Color3): Bar
	local frame = Ui.new("Frame", {
		Size = size,
		Position = position,
		AnchorPoint = anchor,
		BackgroundColor3 = Color3.fromRGB(10, 8, 18),
		BackgroundTransparency = 0.25,
		BorderSizePixel = 0,
		Parent = parent,
	})
	Ui.corner(6).Parent = frame
	Ui.stroke(Color3.new(0, 0, 0), 1.5, 0.3).Parent = frame
	local fill = Ui.new("Frame", {
		Name = "Fill",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = color,
		BorderSizePixel = 0,
		Parent = frame,
	})
	Ui.corner(6).Parent = fill
	Ui.gradient(Color3.new(1, 1, 1), Color3.fromRGB(170, 170, 170)).Parent = fill
	local text = Ui.label({
		Size = UDim2.fromScale(1, 1),
		TextSize = math.max(10, math.floor(frame.Size.Y.Offset * 0.72)),
		ZIndex = 3,
		Parent = frame,
	})
	Ui.textStroke(0.2).Parent = text
	return { frame = frame, fill = fill, text = text }
end

function Ui.tween(instance: Instance, time: number, props: { [string]: any }, style: Enum.EasingStyle?, direction: Enum.EasingDirection?): Tween
	local tween = TweenService:Create(
		instance,
		TweenInfo.new(time, style or Enum.EasingStyle.Quad, direction or Enum.EasingDirection.Out),
		props
	)
	tween:Play()
	return tween
end

function Ui.formatNumber(value: number): string
	local text = tostring(math.floor(value))
	local result = text:reverse():gsub("(%d%d%d)", "%1."):reverse()
	if result:sub(1, 1) == "." then
		result = result:sub(2)
	end
	return result
end

return Ui
