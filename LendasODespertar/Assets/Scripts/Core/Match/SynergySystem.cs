using System.Collections.Generic;

namespace Lendas.Core
{
    public sealed class SynergyRule
    {
        public string Id;
        public string Name;
        public string Description;
        public CharacterId A;
        public CharacterId B;
        public float Cooldown;
    }

    /// <summary>
    /// Fusão de Lendas: quando duas entidades aliadas combinam habilidades compatíveis no momento certo,
    /// ocorre uma Ressonância. Limites contra abuso:
    /// - cada Ressonância tem recarga própria por equipe;
    /// - uma equipe só dispara uma Ressonância a cada 8 s (qualquer combinação);
    /// - Ressonâncias não geram novas Ressonâncias (a zona criada não conta como habilidade de origem).
    /// </summary>
    public sealed class SynergySystem
    {
        public const float GlobalTeamLockout = 8f;
        private readonly Simulation _sim;
        private readonly Dictionary<string, float>[] _ready = { new Dictionary<string, float>(), new Dictionary<string, float>() };
        private readonly float[] _teamLock = new float[2];

        public static readonly SynergyRule TempestadeDeBrasas = new SynergyRule
        {
            Id = "tempestade_de_brasas", Name = "Tempestade de Brasas", A = CharacterId.SaciPerere, B = CharacterId.Boitata, Cooldown = 25f,
            Description = "O Redemoinho do Saci atravessa o Rastro de Fogo do Boitatá e vira um tornado de brasas que segue o Saci, queima e puxa inimigos.",
        };

        public static readonly SynergyRule BrasaAoVento = new SynergyRule
        {
            Id = "brasa_ao_vento", Name = "Brasa ao Vento", A = CharacterId.SaciPerere, B = CharacterId.Boitata, Cooldown = 18f,
            Description = "O Vento Travesso soprado através de chamas do Boitatá espalha brasas: todos os atingidos queimam.",
        };

        public static IEnumerable<SynergyRule> All
        {
            get { yield return TempestadeDeBrasas; yield return BrasaAoVento; }
        }

        public SynergySystem(Simulation sim) { _sim = sim; }

        public bool IsReady(Team team, SynergyRule rule)
        {
            if (!_sim.Config.Synergies || team == Team.None) return false;
            if (_sim.Time < _teamLock[(int)team]) return false;
            return !_ready[(int)team].TryGetValue(rule.Id, out float t) || _sim.Time >= t;
        }

        public float CooldownRemaining(Team team, SynergyRule rule)
        {
            float t = _ready[(int)team].TryGetValue(rule.Id, out float v) ? v : 0f;
            float r = System.MathF.Max(t, _teamLock[(int)team]) - _sim.Time;
            return r > 0f ? r : 0f;
        }

        private void Consume(Team team, SynergyRule rule, Champion a, Champion b, Vec2 pos)
        {
            _ready[(int)team][rule.Id] = _sim.Time + rule.Cooldown;
            _teamLock[(int)team] = _sim.Time + GlobalTeamLockout;
            a.MatchStats.Synergies++;
            if (b != null && b != a) b.MatchStats.Synergies++;
            _sim.Emit(SimEventType.SynergyTriggered, a.Id, b?.Id ?? 0, pos, 0f, rule.Name, team);
        }

        /// <summary>Encontra uma zona de fogo aliada (de um Boitatá) que toque o círculo dado.</summary>
        public Zone FindAlliedFire(Team team, Vec2 center, float radius, int excludeOwner)
        {
            foreach (var z in _sim.Zones)
            {
                if (z.Team != team || z.OwnerId == excludeOwner) continue;
                if (z.Kind != ZoneKind.RastroDeFogo) continue;
                if (Vec2.Distance(z.Position, center) <= z.Radius + radius) return z;
            }
            return null;
        }

        /// <summary>Verificação contínua: Redemoinho do Saci atravessando fogo aliado.</summary>
        public void Tick(float dt)
        {
            foreach (var c in _sim.Champions)
            {
                if (!c.Alive || !(c.Kit is SaciKit saci) || !saci.IsTornado || saci.TornadoFused) continue;
                if (!IsReady(c.Team, TempestadeDeBrasas)) continue;
                var fire = FindAlliedFire(c.Team, c.Position, 1.2f, c.Id);
                if (fire == null) continue;
                var partner = _sim.FindChampion(fire.OwnerId);
                saci.FuseTornado();
                _sim.AddZone(ZoneKind.TempestadeDeBrasas, c, c.Position, 3.2f, saci.TornadoRemaining + 3f, c.Id);
                Consume(c.Team, TempestadeDeBrasas, c, partner, c.Position);
            }
        }

        /// <summary>Chamado pelo Vento Travesso: se o cone atravessa fogo aliado, as brasas se espalham.</summary>
        public bool TryBrasaAoVento(Champion saci, Vec2 origin, Vec2 dir, float range, List<Unit> hit)
        {
            if (!IsReady(saci.Team, BrasaAoVento)) return false;
            Zone fire = null;
            for (float d = 0f; d <= range && fire == null; d += 1.5f)
                fire = FindAlliedFire(saci.Team, origin + dir * d, 1.5f, saci.Id);
            if (fire == null) return false;
            foreach (var u in hit) _sim.ApplyStatus(u, StatusType.Queimadura, 3f, 25f, saci);
            Consume(saci.Team, BrasaAoVento, saci, _sim.FindChampion(fire.OwnerId), fire.Position);
            return true;
        }
    }
}
