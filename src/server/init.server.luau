--!strict
-- Noite Maldita — ponto de entrada do servidor.
-- Carrega todos os sistemas em duas fases: init() de todos, depois start().

local Systems = script:WaitForChild("Systems")

-- Ordem explícita: o mapa e os dados vêm antes de quem depende deles.
local ORDER = {
	"MapBuilder",
	"PlayerData",
	"CharacterService",
	"EnemyService",
	"CombatService",
	"WaveService",
	"ShopService",
	"AwakenService",
}

local loaded: { { name: string, system: any } } = {}
local seen: { [string]: boolean } = {}

local function load(module: Instance)
	if module:IsA("ModuleScript") and not seen[module.Name] then
		seen[module.Name] = true
		table.insert(loaded, { name = module.Name, system = require(module) :: any })
	end
end

for _, name in ORDER do
	local module = Systems:FindFirstChild(name)
	if module then
		load(module)
	else
		warn(`[NoiteMaldita] sistema {name} não encontrado`)
	end
end
for _, module in Systems:GetChildren() do
	load(module)
end

for _, entry in loaded do
	if typeof(entry.system.init) == "function" then
		entry.system.init()
	end
end

for _, entry in loaded do
	if typeof(entry.system.start) == "function" then
		task.spawn(entry.system.start)
	end
end

print("[NoiteMaldita] servidor iniciado")
