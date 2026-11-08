using System.Linq;
using Lendas.Core;
using NUnit.Framework;

namespace Lendas.Core.Tests
{
    public class ArenaTests
    {
        private static Simulation Arena(CharacterId who, out Champion player, out TrainingDummy dummy)
        {
            var sim = new Simulation(MatchConfig.TestArena());
            player = sim.AddChampion(Team.Aurora, who, "Jogador", false);
            player.Position = new Vec2(-4f, 0f);
            dummy = new TrainingDummy(sim, new Vec2(2f, 0f));
            return sim;
        }

        private static void Tick(Simulation sim, TrainingDummy d, Champion p, PlayerCommand cmd)
        {
            sim.ClearEvents();
            sim.SetCommand(p.Id, cmd);
            sim.Step();
            d.AfterStep(Simulation.Dt);
        }

        [Test]
        public void Arena_HasNoObjectives()
        {
            var sim = Arena(CharacterId.SaciPerere, out _, out var d);
            for (int i = 0; i < 30 * 120; i++) { sim.ClearEvents(); sim.Step(); d.AfterStep(Simulation.Dt); }
            Assert.That(sim.Echoes, Is.Empty);
            Assert.That(sim.Match.Marcos, Is.Empty);
            Assert.That(sim.Match.Phase, Is.EqualTo(MatchPhase.Despertar));
        }

        [TestCase(CharacterId.SaciPerere)]
        [TestCase(CharacterId.Boitata)]
        public void EveryAbility_HitsTheDummy(CharacterId who)
        {
            var sim = Arena(who, out var p, out var d);
            foreach (var b in new[] { CommandButtons.Habilidade1, CommandButtons.Habilidade2, CommandButtons.Habilidade3, CommandButtons.Suprema })
            {
                p.Position = new Vec2(-1.5f, 0f);
                d.ResetStats();
                float before = d.TotalDamage;
                bool affected = false;
                Tick(sim, d, p, new PlayerCommand { Pressed = b, AimPoint = d.Unit.Position });
                // Mantém o movimento em direção ao boneco por 2 s (Redemoinho/Investida/Rastro precisam andar).
                for (int i = 0; i < 60; i++)
                {
                    Tick(sim, d, p, new PlayerCommand { Move = (d.Unit.Position - p.Position).Normalized, AimPoint = d.Unit.Position });
                    affected |= d.Unit.Status.Effects.Count > 0 || sim.Events.Any(e => e.Type == SimEventType.Swap);
                }
                affected |= d.TotalDamage > before;
                Assert.That(affected, Is.True, $"{who} {b} deveria ter efeito sobre o boneco (dano, controle ou troca)");
            }
        }

        [Test]
        public void Dummy_NeverDies_AndRecovers()
        {
            var sim = Arena(CharacterId.Boitata, out var p, out var d);
            sim.DealDamage(p, d.Unit, 99999f);
            d.AfterStep(Simulation.Dt);
            Assert.That(d.Unit.Alive, Is.True);
            Assert.That(d.Unit.Hp, Is.EqualTo(d.Unit.MaxHp));
        }
    }
}
