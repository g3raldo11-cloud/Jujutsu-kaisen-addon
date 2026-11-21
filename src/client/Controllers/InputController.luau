--!strict
-- Controles: teclado/mouse, controle (gamepad) e botões na tela (celular).
-- Calcula a mira e manda o pedido ao servidor. Também executa o
-- movimento da investida (dash) quando o servidor confirma.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Net = require(Shared:WaitForChild("Net"))

local ClientUtil = script.Parent.Parent:WaitForChild("Util")
local ClientState = require(ClientUtil:WaitForChild("ClientState"))

local player = Players.LocalPlayer

local InputController = {}

local holdingAttack = false
local dashConnection: RBXScriptConnection? = nil

local KEY_TO_SLOT: { [Enum.KeyCode]: number } = {
	[Enum.KeyCode.Z] = 1,
	[Enum.KeyCode.One] = 1,
	[Enum.KeyCode.X] = 2,
	[Enum.KeyCode.Two] = 2,
	[Enum.KeyCode.C] = 3,
	[Enum.KeyCode.Three] = 3,
	[Enum.KeyCode.V] = 4,
	[Enum.KeyCode.Four] = 4,
	[Enum.KeyCode.ButtonX] = 1,
	[Enum.KeyCode.ButtonY] = 2,
	[Enum.KeyCode.ButtonB] = 3,
	[Enum.KeyCode.ButtonL1] = 4,
}

local function getRoot(): BasePart?
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root
	end
	return nil
end

local function isAlive(): boolean
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	return humanoid ~= nil and humanoid.Health > 0
end

local function raycastParams(): RaycastParams
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	local ignore: { Instance } = {}
	if player.Character then
		table.insert(ignore, player.Character)
	end
	local fx = Workspace:FindFirstChild("FxClient")
	if fx then
		table.insert(ignore, fx)
	end
	params.FilterDescendantsInstances = ignore
	return params
end

-- Mira automática: a maldição mais perto à frente da câmera.
local function autoAim(root: BasePart): Vector3
	local camera = Workspace.CurrentCamera
	local look = if camera then camera.CFrame.LookVector else root.CFrame.LookVector
	local flatLook = Vector3.new(look.X, 0, look.Z)
	flatLook = if flatLook.Magnitude > 0.01 then flatLook.Unit else Vector3.new(0, 0, -1)

	local enemies = Workspace:FindFirstChild("Enemies")
	local best: Vector3? = nil
	local bestScore = math.huge
	if enemies then
		for _, model in enemies:GetChildren() do
			if model:IsA("Model") and model.PrimaryPart then
				local position = model.PrimaryPart.Position
				local offset = Vector3.new(position.X - root.Position.X, 0, position.Z - root.Position.Z)
				local distance = offset.Magnitude
				if distance < 75 and distance > 0.1 then
					local facing = offset.Unit:Dot(flatLook)
					-- Prefere quem está perto e na frente.
					local score = distance * (1.6 - facing)
					if score < bestScore then
						bestScore = score
						best = position
					end
				end
			end
		end
	end
	return best or (root.Position + flatLook * 40)
end

local function aimPoint(root: BasePart): Vector3
	local touchOnly = UserInputService.TouchEnabled and not UserInputService.MouseEnabled
	local gamepad = UserInputService:GetLastInputType().Name:find("Gamepad") ~= nil
	if touchOnly or gamepad then
		return autoAim(root)
	end
	local camera = Workspace.CurrentCamera
	if not camera then
		return autoAim(root)
	end
	local mouse = UserInputService:GetMouseLocation()
	local ray = camera:ViewportPointToRay(mouse.X, mouse.Y)
	local result = Workspace:Raycast(ray.Origin, ray.Direction * 1000, raycastParams())
	return if result then result.Position else ray.Origin + ray.Direction * 200
end

local function request(slot: number)
	if not isAlive() then
		return
	end
	local root = getRoot()
	if not root then
		return
	end
	local now = os.clock()
	local endsAt = ClientState.cooldownEnds[slot]
	if endsAt and now < endsAt - 0.05 then
		return
	end

	local aim = aimPoint(root)
	local flatTarget = Vector3.new(aim.X, root.Position.Y, aim.Z)
	if (flatTarget - root.Position).Magnitude > 1 then
		root.CFrame = CFrame.lookAt(root.Position, flatTarget)
	end
	if slot == 0 then
		ClientState.cooldownEnds[0] = now + Config.M1_COOLDOWN
	end
	Net.event("UseSkill"):FireServer(slot, aim)
end

local function startHoldingAttack()
	if holdingAttack then
		return
	end
	holdingAttack = true
	task.spawn(function()
		while holdingAttack do
			request(0)
			task.wait(Config.M1_COOLDOWN + 0.02)
		end
	end)
end

local function performDash(movement: Vector3)
	local root = getRoot()
	if not root or movement.Magnitude < 0.5 then
		return
	end
	local direction = Vector3.new(movement.X, 0, movement.Z)
	if direction.Magnitude < 0.1 then
		return
	end
	direction = direction.Unit
	local distance = movement.Magnitude
	local params = raycastParams()
	local enemies = Workspace:FindFirstChild("Enemies")
	if enemies then
		local list = params.FilterDescendantsInstances
		table.insert(list, enemies)
		params.FilterDescendantsInstances = list
	end
	local hit = Workspace:Raycast(root.Position, direction * distance, params)
	if hit then
		distance = math.max(0, (hit.Position - root.Position).Magnitude - 2)
	end
	local start = root.Position
	local target = start + direction * distance
	local duration = 0.18
	local elapsed = 0
	if dashConnection then
		dashConnection:Disconnect()
	end
	dashConnection = RunService.RenderStepped:Connect(function(dt)
		elapsed += dt
		local alpha = math.min(1, elapsed / duration)
		local currentRoot = getRoot()
		if not currentRoot then
			if dashConnection then
				dashConnection:Disconnect()
			end
			return
		end
		local position = start:Lerp(target, alpha)
		currentRoot.CFrame = CFrame.lookAt(position, position + direction)
		currentRoot.AssemblyLinearVelocity = Vector3.zero
		if alpha >= 1 and dashConnection then
			dashConnection:Disconnect()
			dashConnection = nil
		end
	end)
end

local function onSkillResult(slot: number, cooldown: number, extra: { [string]: any }?)
	if typeof(slot) ~= "number" or typeof(cooldown) ~= "number" then
		return
	end
	ClientState.cooldownEnds[slot] = os.clock() + cooldown
	ClientState.cooldownTotals[slot] = cooldown
	if extra and typeof(extra.dash) == "Vector3" then
		performDash(extra.dash)
	end
end

function InputController.start()
	pcall(function()
		StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)
	end)

	UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.KeyCode == Enum.KeyCode.ButtonR2 then
			startHoldingAttack()
			return
		end
		local slot = KEY_TO_SLOT[input.KeyCode]
		if slot then
			request(slot)
		elseif input.KeyCode == Enum.KeyCode.B or input.KeyCode == Enum.KeyCode.DPadUp then
			ClientState.ToggleShop:Fire()
		elseif input.KeyCode == Enum.KeyCode.T or input.KeyCode == Enum.KeyCode.DPadDown then
			ClientState.ToggleAwaken:Fire()
		end
	end)

	UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.KeyCode == Enum.KeyCode.ButtonR2 then
			holdingAttack = false
		end
	end)

	-- Se a janela perder o foco com o botão apertado, para de atacar.
	UserInputService.WindowFocusReleased:Connect(function()
		holdingAttack = false
	end)

	ClientState.SkillRequested:Connect(request)
	Net.event("SkillResult").OnClientEvent:Connect(onSkillResult)
end

return InputController
