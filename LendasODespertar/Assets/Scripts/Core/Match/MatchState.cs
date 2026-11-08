using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    public sealed class MarcoState
    {
        public MarcoSpec Spec;
        /// <summary>-100 (Crepúsculo) .. +100 (Aurora).</summary>
        public float Capture;
        public Team Owner = Team.None;
        public bool Active;
        public bool Contested;
        public readonly int[] Present = new int[2];
        public float ProducedMemory;
    }

    public sealed class HeartState
    {
        public bool Awake;
        public Team Owner = Team.None;
        public readonly float[] Dominance = new float[2];
        public Team ChannelTeam = Team.None;
        public float ChannelProgress;
        public float DisruptProgress;
        public bool Contested;
        public readonly int[] Present = new int[2];
    }

    /// <summary>
    /// Regras do Ciclo das Lendas: Despertar (Ecos) → Ressonância (Marcos) → Manifestação (Coração).
    /// Ativar o Coração custa Memória e não vence a partida: é preciso mantê-lo para acumular Domínio.
    /// </summary>
    public sealed class MatchState
    {
        private readonly Simulation _sim;
        public MatchPhase Phase { get; private set; } = MatchPhase.Despertar;
        public readonly float[] Memory = new float[2];
        public readonly List<MarcoState> Marcos = new List<MarcoState>();
        public readonly HeartState Heart = new HeartState();
        public Team Winner { get; private set; } = Team.None;
        public string EndReason { get; private set; }
        private float _echoTimer;
        private readonly int[] _counts = new int[2];

        public MatchState(Simulation sim)
        {
            _sim = sim;
            foreach (var spec in sim.Map.Marcos) Marcos.Add(new MarcoState { Spec = spec });
        }

        public float PhaseTimeRemaining
        {
            get
            {
                var c = _sim.Config;
                switch (Phase)
                {
                    case MatchPhase.Despertar: return c.DespertarDuration - _sim.Time;
                    case MatchPhase.Ressonancia: return c.DespertarDuration + c.RessonanciaDuration - _sim.Time;
                    case MatchPhase.Manifestacao: return c.MaxDuration - _sim.Time;
                    default: return 0f;
                }
            }
        }

        public void AddMemory(Team team, float amount)
        {
            if (team == Team.None) return;
            Memory[(int)team] = MathF.Max(0f, Memory[(int)team] + amount);
        }

        public void Tick(float dt)
        {
            if (Phase == MatchPhase.Encerrada) return;
            if (!_sim.Config.ObjectivesEnabled) return;
            UpdatePhase();
            TickEchoes(dt);
            if (Phase == MatchPhase.Ressonancia || Phase == MatchPhase.Manifestacao) TickMarcos(dt);
            if (Phase == MatchPhase.Manifestacao) TickHeart(dt);
            CheckTimeLimit();
        }

        private void UpdatePhase()
        {
            var c = _sim.Config;
            if (Phase == MatchPhase.Despertar && _sim.Time >= c.DespertarDuration)
            {
                Phase = MatchPhase.Ressonancia;
                foreach (var m in Marcos) m.Active = true;
                _sim.Emit(SimEventType.PhaseChanged, 0, 0, default, (int)Phase, "Ressonância: os Marcos de Memória despertaram");
            }
            if (Phase == MatchPhase.Ressonancia && _sim.Time >= c.DespertarDuration + c.RessonanciaDuration)
            {
                Phase = MatchPhase.Manifestacao;
                Heart.Awake = true;
                // O Marco das Ruínas é absorvido pelo Coração da Lenda.
                foreach (var m in Marcos)
                    if (m.Spec.Kind == MarcoKind.Ruinas) { m.Active = false; m.Owner = Team.None; m.Capture = 0f; }
                _sim.Emit(SimEventType.PhaseChanged, 0, 0, _sim.Map.HeartPosition, (int)Phase, "Manifestação: o Coração da Lenda despertou");
                _sim.Emit(SimEventType.HeartAwakened, 0, 0, _sim.Map.HeartPosition);
            }
        }

        // ------------------------------------------------------------------ Ecos Espirituais

        private void TickEchoes(float dt)
        {
            var c = _sim.Config;
            bool early = Phase == MatchPhase.Despertar;
            int max = early ? c.MaxEchoesDespertar : c.MaxEchoesLater;
            _echoTimer -= dt;
            if (_echoTimer <= 0f && _sim.Echoes.Count < max)
            {
                _echoTimer = early ? c.EchoIntervalDespertar : c.EchoIntervalLater;
                SpawnEcho();
            }

            for (int i = _sim.Echoes.Count - 1; i >= 0; i--)
            {
                var e = _sim.Echoes[i];
                foreach (var ch in _sim.Champions)
                {
                    if (!ch.Alive) continue;
                    if (Vec2.Distance(ch.Position, e.Position) > ch.Radius * ch.Kit.RadiusMultiplier + 0.9f) continue;
                    CollectEcho(ch, e);
                    _sim.Echoes.RemoveAt(i);
                    break;
                }
            }
        }

        public EchoPickup SpawnEcho(Vec2? at = null, float value = 1f)
        {
            Vec2 pos;
            int index = -1;
            if (at.HasValue) pos = at.Value;
            else
            {
                var points = _sim.Map.EchoSpawnPoints;
                int start = _sim.Random.Range(0, points.Count);
                pos = Vec2.Zero;
                for (int k = 0; k < points.Count; k++)
                {
                    int idx = (start + k) % points.Count;
                    bool used = false;
                    foreach (var e in _sim.Echoes) if (e.SpawnIndex == idx) { used = true; break; }
                    if (used) continue;
                    index = idx;
                    pos = points[idx];
                    break;
                }
                if (index < 0) return null;
            }
            var echo = new EchoPickup { Id = _sim.NextId(), Position = pos, SpawnIndex = index, Value = value };
            _sim.Echoes.Add(echo);
            _sim.Emit(SimEventType.EchoSpawned, 0, echo.Id, pos);
            return echo;
        }

        private void CollectEcho(Champion ch, EchoPickup e)
        {
            var c = _sim.Config;
            AddMemory(ch.Team, c.EchoMemory * e.Value);
            ch.Energy = MathF.Min(ch.MaxEnergy, ch.Energy + c.EchoEnergy);
            ch.UltCharge = MathF.Min(100f, ch.UltCharge + 6f);
            ch.MatchStats.Ecos++;
            _sim.Emit(SimEventType.EchoCollected, ch.Id, e.Id, e.Position, c.EchoMemory * e.Value, null, ch.Team);
        }

        // ------------------------------------------------------------------ Marcos de Memória

        private void CountPresence(Vec2 center, float radius, int[] counts)
        {
            counts[0] = counts[1] = 0;
            foreach (var ch in _sim.Champions)
            {
                if (!ch.Alive) continue;
                if (Vec2.Distance(ch.Position, center) <= radius + ch.Radius) counts[(int)ch.Team]++;
            }
        }

        private void TickMarcos(float dt)
        {
            var c = _sim.Config;
            foreach (var m in Marcos)
            {
                if (!m.Active) continue;
                CountPresence(m.Spec.Position, m.Spec.Radius, m.Present);
                int a = m.Present[0], b = m.Present[1];
                m.Contested = a > 0 && b > 0;
                if (!m.Contested && (a > 0 || b > 0))
                {
                    int n = Math.Max(a, b);
                    float rate = c.MarcoCaptureRate * (1f + 0.35f * (n - 1));
                    // Ruínas: território aberto, captura mais rápida.
                    if (m.Spec.Kind == MarcoKind.Ruinas) rate *= 1.25f;
                    float before = m.Capture;
                    m.Capture = MathUtil.Clamp(m.Capture + (a > 0 ? rate : -rate) * dt, -100f, 100f);
                    Team presentTeam = a > 0 ? Team.Aurora : Team.Crepusculo;
                    foreach (var ch in _sim.Champions)
                        if (ch.Alive && ch.Team == presentTeam && Vec2.Distance(ch.Position, m.Spec.Position) <= m.Spec.Radius + ch.Radius)
                            ch.MatchStats.ObjectiveSeconds += dt;

                    if (m.Owner != Team.None && Math.Sign(before) != Math.Sign(m.Capture) && MathF.Abs(m.Capture) > 0f)
                    {
                        _sim.Emit(SimEventType.MarcoNeutralized, 0, 0, m.Spec.Position, 0f, m.Spec.Name, m.Owner);
                        m.Owner = Team.None;
                    }
                    if (m.Owner != Team.Aurora && m.Capture >= 100f) SetOwner(m, Team.Aurora);
                    else if (m.Owner != Team.Crepusculo && m.Capture <= -100f) SetOwner(m, Team.Crepusculo);
                }

                if (m.Owner != Team.None)
                {
                    float produce = c.MarcoMemoryPerSecond;
                    if (m.Spec.Kind == MarcoKind.Ruinas) produce *= 1.4f;
                    // Marco das Águas: produção dobrada durante a Cheia do Rio.
                    if (m.Spec.Kind == MarcoKind.Aguas && _sim.Environment.IsActive(EnvironmentEventKind.CheiaDoRio)) produce *= 2f;
                    AddMemory(m.Owner, produce * dt);
                    m.ProducedMemory += produce * dt;

                    // Marco da Mata: a floresta cura quem a protege.
                    if (m.Spec.Kind == MarcoKind.Mata)
                        foreach (var ch in _sim.Champions)
                            if (ch.Alive && ch.Team == m.Owner && Vec2.Distance(ch.Position, m.Spec.Position) <= m.Spec.Radius + 1f)
                                _sim.Heal(null, ch, 6f * dt);
                }
            }
        }

        private void SetOwner(MarcoState m, Team team)
        {
            m.Owner = team;
            _sim.Emit(SimEventType.MarcoCaptured, 0, 0, m.Spec.Position, 0f, m.Spec.Name, team);
        }

        // ------------------------------------------------------------------ Coração da Lenda

        private void TickHeart(float dt)
        {
            var c = _sim.Config;
            var h = Heart;
            CountPresence(_sim.Map.HeartPosition, _sim.Map.HeartRadius, h.Present);
            int a = h.Present[0], b = h.Present[1];
            h.Contested = a > 0 && b > 0;
            Team solo = h.Contested ? Team.None : (a > 0 ? Team.Aurora : (b > 0 ? Team.Crepusculo : Team.None));

            if (h.Owner == Team.None)
            {
                // Canalização: equipe sozinha no Coração e com Memória suficiente.
                if (solo != Team.None && Memory[(int)solo] >= c.HeartActivationCost)
                {
                    if (h.ChannelTeam != solo) { h.ChannelTeam = solo; h.ChannelProgress = 0f; }
                    h.ChannelProgress += dt;
                    if (h.ChannelProgress >= c.HeartChannelTime)
                    {
                        Memory[(int)solo] -= c.HeartActivationCost;
                        h.Owner = solo;
                        h.ChannelProgress = 0f;
                        h.ChannelTeam = Team.None;
                        h.DisruptProgress = 0f;
                        _sim.Emit(SimEventType.HeartActivated, 0, 0, _sim.Map.HeartPosition, 0f, null, solo);
                    }
                }
                else if (!h.Contested)
                {
                    h.ChannelProgress = MathF.Max(0f, h.ChannelProgress - dt * 2f);
                    if (h.ChannelProgress <= 0f) h.ChannelTeam = Team.None;
                }
                return;
            }

            int owner = (int)h.Owner;
            int enemy = 1 - owner;
            if (h.Present[owner] > 0 && h.Present[enemy] == 0)
            {
                float bonus = 1f + 0.15f * Math.Min(3, h.Present[owner] - 1);
                h.Dominance[owner] += bonus * dt;
                h.DisruptProgress = MathF.Max(0f, h.DisruptProgress - dt);
                foreach (var ch in _sim.Champions)
                    if (ch.Alive && (int)ch.Team == owner && Vec2.Distance(ch.Position, _sim.Map.HeartPosition) <= _sim.Map.HeartRadius + ch.Radius)
                        ch.MatchStats.ObjectiveSeconds += dt;
            }
            else if (h.Present[enemy] > 0 && h.Present[owner] == 0)
            {
                h.DisruptProgress += dt;
                if (h.DisruptProgress >= c.HeartDisruptTime)
                {
                    _sim.Emit(SimEventType.HeartDisrupted, 0, 0, _sim.Map.HeartPosition, 0f, null, (Team)enemy);
                    h.Owner = Team.None;
                    h.DisruptProgress = 0f;
                }
            }

            if (!_sim.Config.DisableVictory && h.Dominance[owner] >= c.HeartDominanceToWin)
                End((Team)owner, "Domínio do Coração da Lenda");
        }

        private void CheckTimeLimit()
        {
            if (_sim.Config.DisableVictory || _sim.Time < _sim.Config.MaxDuration) return;
            float da = Heart.Dominance[0], db = Heart.Dominance[1];
            if (MathF.Abs(da - db) > 0.01f) End(da > db ? Team.Aurora : Team.Crepusculo, "Tempo esgotado — maior Domínio");
            else if (MathF.Abs(Memory[0] - Memory[1]) > 0.01f) End(Memory[0] > Memory[1] ? Team.Aurora : Team.Crepusculo, "Tempo esgotado — maior Memória");
            else End(Team.None, "Empate");
        }

        public void End(Team winner, string reason)
        {
            if (Phase == MatchPhase.Encerrada) return;
            Phase = MatchPhase.Encerrada;
            Winner = winner;
            EndReason = reason;
            _sim.Emit(SimEventType.Victory, 0, 0, default, 0f, reason, winner);
        }
    }
}
