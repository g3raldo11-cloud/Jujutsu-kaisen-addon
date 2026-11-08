using System;
using System.Linq;
using Lendas.Core;
using NUnit.Framework;

namespace Lendas.Core.Tests
{
    /// <summary>Partidas completas 5v5 apenas com bots — validam o ciclo inteiro e o comportamento da IA.</summary>
    public class FullMatchTests
    {
        [TestCase(1u)]
        [TestCase(7u)]
        [TestCase(42u)]
        public void BotMatch_ReachesAConclusion_WithObjectivesAndFights(uint seed)
        {
            var sim = TestUtil.FullBotMatch(seed);
            int marcoCaptures = 0, kills = 0, echoes = 0, heart = 0, abilities = 0, synergies = 0, env = 0;
            int maxTicks = (int)(sim.Config.MaxDuration * Simulation.TickRate) + 10;
            for (int i = 0; i < maxTicks && sim.Match.Phase != MatchPhase.Encerrada; i++)
            {
                sim.ClearEvents();
                sim.Step();
                foreach (var e in sim.Events)
                {
                    switch (e.Type)
                    {
                        case SimEventType.MarcoCaptured: marcoCaptures++; break;
                        case SimEventType.Death: kills++; break;
                        case SimEventType.EchoCollected: echoes++; break;
                        case SimEventType.HeartActivated: heart++; break;
                        case SimEventType.AbilityCast: abilities++; break;
                        case SimEventType.SynergyTriggered: synergies++; break;
                        case SimEventType.EnvironmentStarted: env++; break;
                    }
                }
                foreach (var c in sim.Champions)
                {
                    Assert.That(float.IsNaN(c.Position.X) || float.IsNaN(c.Position.Y), Is.False);
                    Assert.That(sim.Map.InBounds(c.Position, 0f), Is.True);
                }
            }
            TestContext.WriteLine($"seed={seed} t={sim.Time:0}s vencedor={sim.Match.Winner} ({sim.Match.EndReason}) " +
                                  $"marcos={marcoCaptures} mortes={kills} ecos={echoes} coracao={heart} habilidades={abilities} sinergias={synergies} eventos={env} " +
                                  $"dominio={sim.Match.Heart.Dominance[0]:0}/{sim.Match.Heart.Dominance[1]:0} memoria={sim.Match.Memory[0]:0}/{sim.Match.Memory[1]:0}");
            foreach (var c in sim.Champions)
                TestContext.WriteLine($"  {c.PlayerName} {c.Character} K{c.MatchStats.Kills}/D{c.MatchStats.Deaths}/A{c.MatchStats.Assists} dano={c.MatchStats.DamageDealt:0} ecos={c.MatchStats.Ecos} obj={c.MatchStats.ObjectiveSeconds:0}s");

            Assert.That(sim.Match.Phase, Is.EqualTo(MatchPhase.Encerrada));
            Assert.That(echoes, Is.GreaterThan(10), "bots coletam Ecos");
            Assert.That(marcoCaptures, Is.GreaterThan(1), "bots capturam Marcos");
            Assert.That(kills, Is.GreaterThan(3), "bots lutam");
            Assert.That(abilities, Is.GreaterThan(30), "bots usam habilidades");
            Assert.That(heart, Is.GreaterThanOrEqualTo(1), "bots ativam o Coração");
            Assert.That(sim.Champions.All(c => c.MatchStats.DamageDealt > 0f), "todos participam");
        }

        [Test]
        public void Simulation_IsDeterministic()
        {
            var a = TestUtil.FullBotMatch(99);
            var b = TestUtil.FullBotMatch(99);
            a.Run(120f);
            b.Run(120f);
            for (int i = 0; i < a.Champions.Count; i++)
            {
                Assert.That(a.Champions[i].Position.X, Is.EqualTo(b.Champions[i].Position.X));
                Assert.That(a.Champions[i].Hp, Is.EqualTo(b.Champions[i].Hp));
            }
        }

        [Test]
        public void Performance_TenBotsTickBudget()
        {
            var sim = TestUtil.FullBotMatch(5);
            var sw = System.Diagnostics.Stopwatch.StartNew();
            sim.Run(300f);
            sw.Stop();
            double perTickMs = sw.Elapsed.TotalMilliseconds / (300f * Simulation.TickRate);
            TestContext.WriteLine($"custo médio por tick: {perTickMs:0.000} ms");
            Assert.That(perTickMs, Is.LessThan(5.0), "servidor 30 Hz com folga");
        }
    }
}
