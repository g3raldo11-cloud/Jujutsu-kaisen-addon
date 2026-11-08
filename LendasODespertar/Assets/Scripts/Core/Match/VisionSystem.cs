using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>
    /// Visão por equipe calculada no servidor. O cliente só recebe (e só desenha) o que sua equipe vê,
    /// o que impede trapaças de "ver através da névoa". Regras:
    /// - Entidades aliadas veem num raio próprio; Marcos aliados e o Altar também revelam.
    /// - Quem está em vegetação só é visto de muito perto (3,5 m) ou se acabou de atacar.
    /// - A Névoa da Mata reduz a visão dentro da região afetada.
    /// - Ofuscado (Olhar Incandescente) reduz a visão do afetado a 3 m.
    /// </summary>
    public sealed class VisionSystem
    {
        private readonly Simulation _sim;
        private readonly HashSet<int>[] _visible = { new HashSet<int>(), new HashSet<int>() };
        private float _timer;
        public const float RefreshInterval = 0.2f;
        public const float BushRevealRadius = 3.5f;

        public VisionSystem(Simulation sim) { _sim = sim; }

        public bool IsVisibleTo(Team viewer, Unit target)
        {
            if (target == null || viewer == Team.None) return true;
            if (target.Team == viewer) return true;
            return _visible[(int)viewer].Contains(target.Id);
        }

        public IEnumerable<int> VisibleIds(Team viewer) => _visible[(int)viewer];

        public void Tick(float dt)
        {
            _timer -= dt;
            if (_timer > 0f) return;
            _timer = RefreshInterval;
            Recompute();
        }

        public void Recompute()
        {
            for (int t = 0; t < 2; t++)
            {
                var set = _visible[t];
                set.Clear();
                var team = (Team)t;
                foreach (var c in _sim.Champions) if (c.Alive && c.Team != team && Sees(team, c)) set.Add(c.Id);
                foreach (var d in _sim.Decoys) if (d.Alive && d.Team != team && Sees(team, d)) set.Add(d.Id);
                foreach (var s in _sim.Spirits) if (s.Alive && Sees(team, s)) set.Add(s.Id);
            }
        }

        private bool Sees(Team team, Unit target)
        {
            bool inBush = _sim.Map.TerrainAt(target.Position) == TerrainKind.Vegetacao;
            bool revealedByAttack = target is Champion tc && tc.TimeSinceAttack < 1f;
            bool fogged = _sim.Environment.IsFogged(target.Position);

            foreach (var v in _sim.Champions)
            {
                if (!v.Alive || v.Team != team) continue;
                float radius = v.Stats.VisionRadius;
                if (v.Status.Has(StatusType.Ofuscado)) radius = 3f;
                if (fogged || _sim.Environment.IsFogged(v.Position)) radius = System.MathF.Min(radius, 5f);
                float dist = Vec2.Distance(v.Position, target.Position);
                if (dist > radius) continue;
                if (inBush && !revealedByAttack && dist > BushRevealRadius) continue;
                return true;
            }
            if (!inBush || revealedByAttack)
            {
                foreach (var m in _sim.Match.Marcos)
                    if (m.Owner == team && Vec2.Distance(m.Spec.Position, target.Position) <= (fogged ? 5f : 8f)) return true;
            }
            if (Vec2.Distance(_sim.Map.BaseCenter[(int)team], target.Position) <= _sim.Map.BaseRadius + 4f) return true;
            return false;
        }
    }
}
