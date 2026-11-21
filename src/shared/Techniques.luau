--!strict
-- Técnicas de feitiçaria. Cada jogador desperta UMA técnica (sorteada) que
-- define suas 3 habilidades e o seu Território (golpe especial).
--
-- Slots: 1 = projétil (Z), 2 = explosão em área (X), 3 = investida (C),
--        4 = Território (V), 0 = golpe básico (clique).

export type Effect = "knockback" | "pierce" | "burn" | "slow" | "chain" | "lifesteal" | "pull" | "heal"
export type RarityId = "comum" | "raro" | "epico" | "lendario"
export type SkillKind = "projectile" | "burst" | "dash"

export type SkillDef = {
	name: string,
	kind: SkillKind,
	damage: number,
	cooldown: number,
	cost: number,
	radius: number,
	speed: number?,
	range: number?,
	count: number?,
}

export type DomainDef = {
	name: string,
	radius: number,
	duration: number,
	damage: number, -- por pulso
	tick: number, -- segundos entre pulsos
}

export type Technique = {
	id: string,
	name: string,
	rarity: RarityId,
	description: string,
	effectText: string,
	color: Color3,
	secondary: Color3,
	effect: Effect,
	skills: { SkillDef },
	domain: DomainDef,
}

export type RarityInfo = {
	name: string,
	weight: number,
	rank: number,
	color: Color3,
}

local Techniques = {}

Techniques.RARITY_ORDER = { "comum", "raro", "epico", "lendario" } :: { RarityId }

Techniques.RARITY = {
	comum = { name = "Comum", weight = 50, rank = 1, color = Color3.fromRGB(205, 205, 215) },
	raro = { name = "Raro", weight = 30, rank = 2, color = Color3.fromRGB(80, 165, 255) },
	epico = { name = "Épico", weight = 15, rank = 3, color = Color3.fromRGB(195, 95, 255) },
	lendario = { name = "Lendário", weight = 5, rank = 4, color = Color3.fromRGB(255, 195, 45) },
} :: { [RarityId]: RarityInfo }

Techniques.list = {
	{
		id = "terra",
		name = "Punho de Rocha",
		rarity = "comum",
		description = "Força bruta da terra. Golpes pesados que empurram as maldições para longe.",
		effectText = "Empurra os inimigos",
		color = Color3.fromRGB(170, 120, 75),
		secondary = Color3.fromRGB(255, 205, 130),
		effect = "knockback",
		skills = {
			{ name = "Rocha Arremessada", kind = "projectile", damage = 32, cooldown = 2.4, cost = 15, radius = 4, speed = 85, range = 95 },
			{ name = "Tremor", kind = "burst", damage = 36, cooldown = 6, cost = 25, radius = 15 },
			{ name = "Investida Rochosa", kind = "dash", damage = 30, cooldown = 5, cost = 18, radius = 6, range = 22 },
		},
		domain = { name = "Território: Vale de Pedra", radius = 32, duration = 8, damage = 20, tick = 0.5 },
	},
	{
		id = "vento",
		name = "Lâmina do Vento",
		rarity = "comum",
		description = "Cortes rápidos que atravessam fileiras de inimigos.",
		effectText = "Projéteis atravessam",
		color = Color3.fromRGB(150, 240, 210),
		secondary = Color3.fromRGB(255, 255, 255),
		effect = "pierce",
		skills = {
			{ name = "Corte Crescente", kind = "projectile", damage = 18, cooldown = 2, cost = 15, radius = 3, speed = 135, range = 110, count = 3 },
			{ name = "Ciclone", kind = "burst", damage = 26, cooldown = 5.5, cost = 22, radius = 16 },
			{ name = "Passo do Vendaval", kind = "dash", damage = 24, cooldown = 3.5, cost = 14, radius = 6, range = 34 },
		},
		domain = { name = "Território: Céu Cortante", radius = 34, duration = 8, damage = 17, tick = 0.4 },
	},
	{
		id = "fogo",
		name = "Chama Carmesim",
		rarity = "raro",
		description = "Fogo amaldiçoado que continua queimando depois do golpe.",
		effectText = "Queimadura (dano contínuo)",
		color = Color3.fromRGB(255, 75, 40),
		secondary = Color3.fromRGB(255, 195, 60),
		effect = "burn",
		skills = {
			{ name = "Bola de Fogo", kind = "projectile", damage = 34, cooldown = 2.4, cost = 16, radius = 6, speed = 90, range = 100 },
			{ name = "Erupção", kind = "burst", damage = 40, cooldown = 6, cost = 26, radius = 16 },
			{ name = "Rastro Flamejante", kind = "dash", damage = 32, cooldown = 4.5, cost = 18, radius = 7, range = 26 },
		},
		domain = { name = "Território: Fornalha Rubra", radius = 32, duration = 8, damage = 24, tick = 0.5 },
	},
	{
		id = "gelo",
		name = "Geada Eterna",
		rarity = "raro",
		description = "O frio que paralisa. Maldições congeladas mal conseguem andar.",
		effectText = "Deixa os inimigos lentos",
		color = Color3.fromRGB(125, 205, 255),
		secondary = Color3.fromRGB(235, 250, 255),
		effect = "slow",
		skills = {
			{ name = "Lança de Gelo", kind = "projectile", damage = 34, cooldown = 2.2, cost = 15, radius = 4, speed = 120, range = 110 },
			{ name = "Inverno Súbito", kind = "burst", damage = 32, cooldown = 6, cost = 24, radius = 19 },
			{ name = "Deslize Glacial", kind = "dash", damage = 30, cooldown = 4, cost = 16, radius = 7, range = 28 },
		},
		domain = { name = "Território: Tundra Silenciosa", radius = 36, duration = 8, damage = 22, tick = 0.5 },
	},
	{
		id = "trovao",
		name = "Trovão Celeste",
		rarity = "epico",
		description = "Relâmpagos que saltam de um inimigo para o outro.",
		effectText = "Dano salta para inimigos próximos",
		color = Color3.fromRGB(255, 230, 80),
		secondary = Color3.fromRGB(150, 190, 255),
		effect = "chain",
		skills = {
			{ name = "Raio Saltitante", kind = "projectile", damage = 40, cooldown = 2.2, cost = 16, radius = 4, speed = 170, range = 120 },
			{ name = "Tempestade", kind = "burst", damage = 46, cooldown = 6, cost = 26, radius = 17 },
			{ name = "Passo Relâmpago", kind = "dash", damage = 38, cooldown = 3.5, cost = 16, radius = 7, range = 32 },
		},
		domain = { name = "Território: Coroa de Trovões", radius = 34, duration = 8, damage = 28, tick = 0.5 },
	},
	{
		id = "sombra",
		name = "Sombra Faminta",
		rarity = "epico",
		description = "As sombras devoram as maldições e devolvem vida a você.",
		effectText = "Rouba vida",
		color = Color3.fromRGB(95, 45, 150),
		secondary = Color3.fromRGB(255, 70, 140),
		effect = "lifesteal",
		skills = {
			{ name = "Garra Sombria", kind = "projectile", damage = 42, cooldown = 2.3, cost = 16, radius = 5, speed = 110, range = 100 },
			{ name = "Boca do Abismo", kind = "burst", damage = 48, cooldown = 6, cost = 26, radius = 16 },
			{ name = "Passo Fantasma", kind = "dash", damage = 40, cooldown = 3.8, cost = 16, radius = 7, range = 30 },
		},
		domain = { name = "Território: Banquete das Sombras", radius = 34, duration = 8, damage = 28, tick = 0.5 },
	},
	{
		id = "vazio",
		name = "Vazio Estelar",
		rarity = "lendario",
		description = "Dobra o espaço. Puxa tudo para o centro e esmaga.",
		effectText = "Puxa os inimigos",
		color = Color3.fromRGB(60, 30, 130),
		secondary = Color3.fromRGB(175, 130, 255),
		effect = "pull",
		skills = {
			{ name = "Esfera do Vazio", kind = "projectile", damage = 52, cooldown = 2.6, cost = 18, radius = 8, speed = 75, range = 100 },
			{ name = "Colapso", kind = "burst", damage = 58, cooldown = 6, cost = 28, radius = 21 },
			{ name = "Dobra Espacial", kind = "dash", damage = 46, cooldown = 3.5, cost = 16, radius = 8, range = 36 },
		},
		domain = { name = "Território: Horizonte Infinito", radius = 38, duration = 9, damage = 34, tick = 0.5 },
	},
	{
		id = "sol",
		name = "Coração do Sol",
		rarity = "lendario",
		description = "Luz que queima maldições e cura os aliados.",
		effectText = "Cura você e os aliados",
		color = Color3.fromRGB(255, 200, 60),
		secondary = Color3.fromRGB(255, 255, 210),
		effect = "heal",
		skills = {
			{ name = "Lança Solar", kind = "projectile", damage = 50, cooldown = 2.2, cost = 16, radius = 5, speed = 160, range = 120 },
			{ name = "Aurora", kind = "burst", damage = 52, cooldown = 6, cost = 26, radius = 19 },
			{ name = "Cometa", kind = "dash", damage = 46, cooldown = 3.8, cost = 16, radius = 8, range = 32 },
		},
		domain = { name = "Território: Meio-Dia Eterno", radius = 36, duration = 9, damage = 30, tick = 0.5 },
	},
} :: { Technique }

Techniques.byId = {} :: { [string]: Technique }
for _, technique in Techniques.list do
	Techniques.byId[technique.id] = technique
end

-- Sorteia uma técnica. `minRank` > 1 garante raridade mínima (sistema de "pena").
function Techniques.roll(rng: Random, minRank: number): Technique
	local total = 0
	for _, rarityId in Techniques.RARITY_ORDER do
		local info = Techniques.RARITY[rarityId]
		if info.rank >= minRank then
			total += info.weight
		end
	end

	local pick = rng:NextNumber() * total
	local chosen: RarityId = "lendario"
	for _, rarityId in Techniques.RARITY_ORDER do
		local info = Techniques.RARITY[rarityId]
		if info.rank >= minRank then
			chosen = rarityId
			pick -= info.weight
			if pick <= 0 then
				break
			end
		end
	end

	local pool: { Technique } = {}
	for _, technique in Techniques.list do
		if technique.rarity == chosen then
			table.insert(pool, technique)
		end
	end
	return pool[rng:NextInteger(1, #pool)]
end

return Techniques
