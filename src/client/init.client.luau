--!strict
-- Noite Maldita — ponto de entrada do cliente.
-- Carrega os controladores (interface, controles, efeitos) em duas fases.

local Controllers = script:WaitForChild("Controllers")

local ORDER = {
	"FxController",
	"AnnouncerController",
	"HudController",
	"InputController",
	"EnemyBarsController",
	"ShopController",
	"AwakenController",
}

local loaded: { { name: string, controller: any } } = {}
local seen: { [string]: boolean } = {}

local function load(module: Instance)
	if module:IsA("ModuleScript") and not seen[module.Name] then
		seen[module.Name] = true
		table.insert(loaded, { name = module.Name, controller = require(module) :: any })
	end
end

for _, name in ORDER do
	local module = Controllers:WaitForChild(name, 5)
	if module then
		load(module)
	end
end
for _, module in Controllers:GetChildren() do
	load(module)
end

for _, entry in loaded do
	if typeof(entry.controller.init) == "function" then
		entry.controller.init()
	end
end

for _, entry in loaded do
	if typeof(entry.controller.start) == "function" then
		task.spawn(entry.controller.start)
	end
end

print("[NoiteMaldita] cliente iniciado")
