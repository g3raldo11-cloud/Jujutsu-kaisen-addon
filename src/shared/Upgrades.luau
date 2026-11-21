--!strict
-- Itens da loja entre ondas. Custos e efeitos são calculados no servidor;
-- o cliente usa a mesma tabela só para mostrar preços.

export type Upgrade = {
	id: string,
	name: string,
	description: string,
	baseCost: number,
	costGrowth: number,
	maxLevel: number,
	perLevel: number,
	team: boolean?,
}

local Upgrades = {}

Upgrades.list = {
	{
		id = "vida",
		name = "Vigor",
		description = "+25 de vida máxima",
		baseCost = 40,
		costGrowth = 1.45,
		maxLevel = 10,
		perLevel = 25,
	},
	{
		id = "dano",
		name = "Fúria",
		description = "+15% de dano em tudo",
		baseCost = 50,
		costGrowth = 1.5,
		maxLevel = 12,
		perLevel = 0.15,
	},
	{
		id = "energia",
		name = "Fluxo Amaldiçoado",
		description = "+20% de regeneração de energia",
		baseCost = 40,
		costGrowth = 1.5,
		maxLevel = 8,
		perLevel = 0.2,
	},
	{
		id = "recarga",
		name = "Foco",
		description = "-6% no tempo de recarga",
		baseCost = 55,
		costGrowth = 1.55,
		maxLevel = 6,
		perLevel = 0.06,
	},
	{
		id = "velocidade",
		name = "Passos Leves",
		description = "+1,5 de velocidade",
		baseCost = 35,
		costGrowth = 1.45,
		maxLevel = 6,
		perLevel = 1.5,
	},
	{
		id = "selo",
		name = "Restaurar Selo",
		description = "Cura 30% do Selo Sagrado (ajuda o time todo)",
		baseCost = 60,
		costGrowth = 1.3,
		maxLevel = 99,
		perLevel = 0,
		team = true,
	},
} :: { Upgrade }

Upgrades.byId = {} :: { [string]: Upgrade }
for _, upgrade in Upgrades.list do
	Upgrades.byId[upgrade.id] = upgrade
end

function Upgrades.cost(upgrade: Upgrade, level: number): number
	return math.floor(upgrade.baseCost * upgrade.costGrowth ^ level)
end

return Upgrades
