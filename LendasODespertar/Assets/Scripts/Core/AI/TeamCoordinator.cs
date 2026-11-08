using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>
    /// Coordenação de equipe dos bots: distribui objetivos (Ecos, Marcos, Coração), escolhe um alvo
    /// de foco e decide quando agrupar antes de disputar o Coração. Jogadores humanos da equipe são
    /// considerados na contagem, mas nunca recebem ordens.
    /// </summary>
    public sealed class TeamCoordinator
    {
        private readonly Simulation _sim;
        public readonly Team Team;
        private float _timer;
        public Unit FocusTarget { get; private set; }
        private readonly Dictionary<object, int> _assigned = new Dictionary<object, int>();

        public TeamCoordinator(Simulation sim, Team team)
        {
            _sim = sim;
            Team = team;
        }

        public void Tick(float dt)
        {
            _timer -= dt;
            if (_timer > 0f) return;
            _timer = 1f;
            ChooseFocus();
            Assign();
        }

        private void ChooseFocus()
        {
            FocusTarget = null;
            float best = float.MaxValue;
            foreach (var e in _sim.Champions)
            {
                if (!e.Alive || e.Team == Team || !_sim.Vision.IsVisibleTo(Team, e)) continue;
                int alliesClose = 0;
                foreach (var a in _sim.Champions)
                    if (a.Alive && a.Team == Team && Vec2.Distance(a.Position, e.Position) < 10f) alliesClose++;
                if (alliesClose < 2) continue;
                float score = e.Hp - alliesClose * 60f;
                if (score < best) { best = score; FocusTarget = e; }
            }
        }

        private void Assign()
        {
            var bots = new List<BotBrain>();
            int teamAlive = 0;
            foreach (var c in _sim.Champions)
            {
                if (c.Team != Team) continue;
                if (c.Alive) teamAlive++;
                var b = _sim.BotFor(c.Id);
                if (b != null && c.Alive) bots.Add(b);
            }
            if (bots.Count == 0) return;
            _assigned.Clear();

            var match = _sim.Match;
            int me = (int)Team;
            switch (match.Phase)
            {
                case MatchPhase.Despertar:
                    foreach (var b in bots) AssignEchoOrFallback(b, NearestMarcoSpec(b.Self.Position).Position);
                    break;

                case MatchPhase.Ressonancia:
                    foreach (var b in bots) AssignBestMarco(b);
                    break;

                case MatchPhase.Manifestacao:
                {
                    var heart = match.Heart;
                    Vec2 hp = _sim.Map.HeartPosition;
                    bool ownHeart = heart.Owner == Team;
                    bool canActivate = match.Memory[me] >= _sim.Config.HeartActivationCost;
                    bool enemyHeart = heart.Owner != Team.None && heart.Owner != Team;
                    if (ownHeart || canActivate || enemyHeart)
                    {
                        // Agrupar antes de entrar: espera ter ao menos 3 vivos.
                        bool group = teamAlive >= 3 || ownHeart;
                        foreach (var b in bots)
                        {
                            if (group) Set(b, ownHeart ? BotGoal.Defender : BotGoal.Coracao, hp, _sim.Map.HeartRadius);
                            else Set(b, BotGoal.Agrupar, Vec2.Lerp(_sim.Map.BaseCenter[me], hp, 0.6f), 4f);
                        }
                    }
                    else
                    {
                        // Precisa de Memória: dois seguram o Coração, o resto busca Marcos e Ecos.
                        int held = 0;
                        foreach (var b in bots)
                        {
                            if (held < 2 && Vec2.Distance(b.Self.Position, hp) < 30f) { Set(b, BotGoal.Coracao, hp, _sim.Map.HeartRadius); held++; }
                            else AssignBestMarco(b);
                        }
                    }
                    break;
                }
                default:
                    break;
            }
        }

        private void Set(BotBrain b, BotGoal goal, Vec2 point, float radius)
        {
            b.AssignedGoal = goal;
            b.Objective = point;
            b.ObjectiveRadius = radius;
        }

        private MarcoSpec NearestMarcoSpec(Vec2 p)
        {
            MarcoSpec best = null;
            float bd = float.MaxValue;
            foreach (var m in _sim.Map.Marcos)
            {
                float d = Vec2.Distance(m.Position, p);
                if (d < bd) { bd = d; best = m; }
            }
            return best;
        }

        private bool AssignEchoOrFallback(BotBrain b, Vec2 fallback)
        {
            EchoPickup best = null;
            float bestScore = float.MaxValue;
            foreach (var e in _sim.Echoes)
            {
                if (_assigned.ContainsKey(e)) continue;
                float d = Vec2.Distance(e.Position, b.Self.Position);
                // Evita atravessar o mapa inteiro atrás de um Eco no lado inimigo.
                float enemySide = Vec2.Distance(e.Position, _sim.Map.BaseCenter[1 - (int)Team]) < 35f ? 12f : 0f;
                float score = d + enemySide;
                if (score < bestScore) { bestScore = score; best = e; }
            }
            if (best != null && bestScore < 45f)
            {
                _assigned[best] = 1;
                Set(b, BotGoal.Coletar, best.Position, 0.2f);
                return true;
            }
            Set(b, BotGoal.Capturar, fallback, 3f);
            return false;
        }

        private void AssignBestMarco(BotBrain b)
        {
            MarcoState best = null;
            float bestScore = float.MinValue;
            foreach (var m in _sim.Match.Marcos)
            {
                if (!m.Active) continue;
                float value;
                if (m.Owner == Team) value = m.Present[1 - (int)Team] > 0 ? 3.5f : 0.6f;
                else if (m.Owner == Team.None) value = 2.5f;
                else value = 3f;
                if (m.Spec.Kind == MarcoKind.Ruinas) value += 0.3f;
                _assigned.TryGetValue(m, out int count);
                float score = value / (1f + count * 1.2f) - Vec2.Distance(m.Spec.Position, b.Self.Position) * 0.03f;
                if (score > bestScore) { bestScore = score; best = m; }
            }

            // Eco próximo vale um desvio curto.
            EchoPickup echo = null;
            foreach (var e in _sim.Echoes)
                if (!_assigned.ContainsKey(e) && Vec2.Distance(e.Position, b.Self.Position) < 9f) { echo = e; break; }
            if (echo != null && (best == null || bestScore < 1.2f))
            {
                _assigned[echo] = 1;
                Set(b, BotGoal.Coletar, echo.Position, 0.2f);
                return;
            }
            if (best == null) { AssignEchoOrFallback(b, _sim.Map.HeartPosition); return; }
            _assigned.TryGetValue(best, out int c);
            _assigned[best] = c + 1;
            bool defend = best.Owner == Team;
            Set(b, defend ? BotGoal.Defender : BotGoal.Capturar, best.Spec.Position, best.Spec.Radius * 0.7f);
        }
    }
}
