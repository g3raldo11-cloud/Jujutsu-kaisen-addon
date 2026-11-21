--!strict
-- Barra de vida em cima de cada maldição, piscada branca ao levar dano,
-- fogo quando queimando e cor de gelo quando lenta.

local Workspace = game:GetService("Workspace")

local ClientUtil = script.Parent.Parent:WaitForChild("Util")
local Ui = require(ClientUtil:WaitForChild("Ui"))

local EnemyBarsController = {}

local ICE = Color3.fromRGB(150, 215, 255)

local function setup(model: Instance)
	if not model:IsA("Model") then
		return
	end
	local root = model:WaitForChild("Root", 5)
	local body = model:WaitForChild("Corpo", 5)
	if not root or not root:IsA("BasePart") or not body or not body:IsA("BasePart") then
		return
	end
	local baseColor = body.Color
	local baseMaterial = body.Material
	local size = (model:GetAttribute("Size") :: number?) or 4
	local isBoss = model:GetAttribute("Boss") == true

	local function restoreLook()
		if not body.Parent then
			return
		end
		if model:GetAttribute("Slowed") == true then
			body.Color = baseColor:Lerp(ICE, 0.6)
			body.Material = Enum.Material.Ice
		else
			body.Color = baseColor
			body.Material = baseMaterial
		end
	end

	local fill: Frame? = nil
	if not isBoss then
		local billboard = Instance.new("BillboardGui")
		billboard.Name = "Vida"
		billboard.Adornee = root
		billboard.Size = UDim2.new(2.5 + size * 0.5, 0, 0, Ui.s(26))
		billboard.StudsOffset = Vector3.new(0, size * 0.5 + 1.4, 0)
		billboard.MaxDistance = 140
		billboard.LightInfluence = 0
		billboard.Parent = model

		local name = Ui.label({
			Size = UDim2.new(1, 0, 0, Ui.s(14)),
			TextSize = Ui.s(12),
			TextColor3 = Color3.fromRGB(255, 200, 210),
			Text = (model:GetAttribute("EnemyName") :: string?) or "",
			Parent = billboard,
		})
		Ui.textStroke(0.3).Parent = name

		local back = Ui.new("Frame", {
			Position = UDim2.new(0, 0, 0, Ui.s(15)),
			Size = UDim2.new(1, 0, 0, Ui.s(8)),
			BackgroundColor3 = Color3.fromRGB(20, 10, 15),
			BorderSizePixel = 0,
			Parent = billboard,
		})
		Ui.corner(4).Parent = back
		local bar = Ui.new("Frame", {
			Size = UDim2.fromScale(1, 1),
			BackgroundColor3 = Color3.fromRGB(230, 50, 70),
			BorderSizePixel = 0,
			Parent = back,
		})
		Ui.corner(4).Parent = bar
		fill = bar
	end

	local lastHealth = (model:GetAttribute("Health") :: number?) or 1
	model:GetAttributeChangedSignal("Health"):Connect(function()
		local health = (model:GetAttribute("Health") :: number?) or 0
		local maxHealth = math.max(1, (model:GetAttribute("MaxHealth") :: number?) or 1)
		if fill then
			fill.Size = UDim2.fromScale(math.clamp(health / maxHealth, 0, 1), 1)
		end
		if health < lastHealth and body.Parent then
			body.Color = Color3.new(1, 1, 1)
			body.Material = Enum.Material.Neon
			task.delay(0.07, restoreLook)
		end
		lastHealth = health
	end)

	model:GetAttributeChangedSignal("Slowed"):Connect(restoreLook)

	model:GetAttributeChangedSignal("Burning"):Connect(function()
		local existing = body:FindFirstChild("Queimando")
		if model:GetAttribute("Burning") == true then
			if not existing then
				local fire = Instance.new("Fire")
				fire.Name = "Queimando"
				fire.Size = size * 0.8
				fire.Heat = 5
				fire.Color = Color3.fromRGB(255, 110, 40)
				fire.SecondaryColor = Color3.fromRGB(255, 40, 20)
				fire.Parent = body
			end
		elseif existing then
			existing:Destroy()
		end
	end)
end

function EnemyBarsController.start()
	local folder = Workspace:WaitForChild("Enemies")
	folder.ChildAdded:Connect(function(child)
		task.spawn(setup, child)
	end)
	for _, child in folder:GetChildren() do
		task.spawn(setup, child)
	end
end

return EnemyBarsController
