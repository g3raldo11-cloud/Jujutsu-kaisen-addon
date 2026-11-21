--!strict
-- Números de balanceamento do jogo. Este arquivo é replicado para os
-- jogadores (qualquer um pode ler), então nada aqui é secreto, e o servidor
-- nunca confia em valores enviados pelo cliente.

local Config = {
	-- Partida
	MAX_PLAYERS = 4,
	LOBBY_COUNTDOWN = 25, -- segundos no saguão antes de começar
	READY_COUNTDOWN = 4, -- quando todos apertam "Pronto"
	SHOP_DURATION = 20, -- intervalo de loja entre ondas
	GAME_OVER_DURATION = 12,
	BOSS_EVERY = 5, -- chefe a cada N ondas
	MAX_ALIVE_ENEMIES = 28,
	LATE_JOIN_COINS_PER_WAVE = 25, -- moedas para quem entra no meio

	-- Mapa
	ARENA_LIMIT = 190, -- inimigos ficam dentro deste quadrado (±)
	PORTAL_DISTANCE = 150,
	SEAL_POSITION = Vector3.new(0, 7, 0),
	SEAL_RADIUS = 5,
	SEAL_MAX_HEALTH = 1500,
	SEAL_HEAL_FRACTION = 0.3, -- item "Restaurar Selo"

	-- Jogador
	PLAYER_BASE_HEALTH = 100,
	PLAYER_BASE_SPEED = 18,
	ENERGY_MAX = 100,
	ENERGY_REGEN = 9, -- por segundo
	ENERGY_ON_HIT = 2,
	ULT_MAX = 100,
	ULT_PER_DAMAGE = 0.07,
	ULT_PER_KILL = 3,
	RESPAWN_DELAY = 3,
	DASH_INVULNERABILITY = 0.35,

	-- Golpe básico (clique)
	M1_COOLDOWN = 0.36,
	M1_DAMAGE = 14,
	M1_RANGE = 8,
	M1_COMBO_RESET = 1.2,
	M1_FINISHER_MULT = 2,

	-- Recompensas
	WAVE_CLEAR_COINS_BASE = 30,
	WAVE_CLEAR_COINS_PER_WAVE = 6,
	FRAGMENTS_PER_WAVE = 4,
	FRAGMENTS_PER_KILLS = 5, -- 1 fragmento a cada N abates
	FRAGMENTS_PER_BOSS = 15,

	-- Despertar (sorteio de técnica)
	REROLL_COST = 60,
	STARTING_FRAGMENTS = 60,
	PITY_ROLLS = 10, -- épico ou melhor garantido a cada N rolagens

	-- Salvamento
	DATASTORE_NAME = "NoiteMaldita_v1",
	AUTOSAVE_INTERVAL = 90,
}

return table.freeze(Config)
