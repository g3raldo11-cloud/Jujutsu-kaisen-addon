using System;

namespace Lendas.Core
{
    /// <summary>
    /// Boneco de teste da Arena: uma entidade inimiga parada que nunca morre de verdade.
    /// Registra o dano recebido (total, último golpe e DPS dos últimos segundos) e volta à vida cheia
    /// depois de alguns segundos sem apanhar, para testar habilidades, controles e combinações.
    /// </summary>
    public sealed class TrainingDummy
    {
        private readonly Simulation _sim;
        public readonly Champion Unit;
        public float TotalDamage { get; private set; }
        public float LastHit { get; private set; }
        public float Dps { get; private set; }
        public Vec2 Home;
        /// <summary>Se verdadeiro, o boneco anda de um lado para o outro (testar mira e investidas).</summary>
        public bool Moving;
        private float _windowDamage;
        private float _windowTime;
        private float _sinceHit = 999f;
        private float _moveClock;

        public TrainingDummy(Simulation sim, Vec2 position, CharacterId look = CharacterId.Boitata)
        {
            _sim = sim;
            Home = position;
            Unit = sim.AddChampion(Team.Crepusculo, look, "Boneco de Teste", false);
            Unit.MaxHp = Unit.Hp = 3000f;
            Unit.Position = position;
            Unit.Facing = -Vec2.Right;
        }

        /// <summary>Chamar após cada <see cref="Simulation.Step"/>, passando os eventos do tick.</summary>
        public void AfterStep(float dt)
        {
            foreach (var e in _sim.Events)
            {
                if (e.Type != SimEventType.Damage || e.TargetId != Unit.Id) continue;
                TotalDamage += e.Value;
                _windowDamage += e.Value;
                if (e.Value >= 1f) LastHit = e.Value;
                _sinceHit = 0f;
            }
            _sinceHit += dt;
            _windowTime += dt;
            if (_windowTime >= 1f)
            {
                Dps = _windowDamage / _windowTime;
                _windowDamage = 0f;
                _windowTime = 0f;
            }

            // Nunca fica morto: renasce na hora, no lugar.
            if (!Unit.Alive || Unit.Hp < 1f)
            {
                Unit.Alive = true;
                Unit.Hp = Unit.MaxHp;
                Unit.RespawnTimer = 0f;
                Unit.Position = Home;
            }
            if (_sinceHit > 4f && Unit.Hp < Unit.MaxHp) Unit.Hp = Unit.MaxHp;

            Vec2 move = Vec2.Zero;
            if (Moving)
            {
                _moveClock += dt;
                move = new Vec2(0f, MathF.Sin(_moveClock * 0.8f) >= 0f ? 1f : -1f);
            }
            else if (Vec2.Distance(Unit.Position, Home) > 0.3f && Unit.ForcedTime <= 0f && _sinceHit > 2f)
            {
                move = (Home - Unit.Position).Normalized; // volta ao lugar depois de empurrado
            }
            _sim.SetCommand(Unit.Id, new PlayerCommand { Move = move, AimPoint = Unit.Position - Vec2.Right });
        }

        public void ResetStats()
        {
            TotalDamage = 0f;
            LastHit = 0f;
            Dps = 0f;
            Unit.Hp = Unit.MaxHp;
            Unit.Status.Clear();
            Unit.Position = Home;
        }
    }
}
