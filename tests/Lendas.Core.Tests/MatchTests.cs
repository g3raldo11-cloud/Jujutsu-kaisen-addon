using System.Linq;
using Lendas.Core;
using NUnit.Framework;

namespace Lendas.Core.Tests
{
    public class MatchTests
    {
        [Test]
        public void Phases_AdvanceOnSchedule()
        {
            var cfg = new MatchConfig { DespertarDuration = 5f, RessonanciaDuration = 5f, EnvironmentEvents = false };
            var sim = new Simulation(cfg);
            Assert.That(sim.Match.Phase, Is.EqualTo(MatchPhase.Despertar));
            Assert.That(sim.Match.Marcos.All(m => !m.Active));
            sim.Run(5.1f);
            Assert.That(sim.Match.Phase, Is.EqualTo(MatchPhase.Ressonancia));
            Assert.That(sim.Match.Marcos.All(m => m.Active));
            sim.Run(5f);
            Assert.That(sim.Match.Phase, Is.EqualTo(MatchPhase.Manifestacao));
            Assert.That(sim.Match.Heart.Awake);
            Assert.That(sim.Match.Marcos.Single(m => m.Spec.Kind == MarcoKind.Ruinas).Active, Is.False, "Marco das Ruínas vira o Coração");
        }

        [Test]
        public void Echoes_SpawnAndAreCollected()
        {
            var sim = new Simulation(new MatchConfig { EnvironmentEvents = false });
            var c = sim.AddChampion(Team.Aurora, CharacterId.SaciPerere, "a", false);
            sim.Run(4f);
            Assert.That(sim.Echoes.Count, Is.GreaterThan(0));
            var echo = sim.Echoes[0];
            c.Position = echo.Position;
            sim.Step();
            Assert.That(sim.Echoes.Contains(echo), Is.False);
            Assert.That(sim.Match.Memory[0], Is.EqualTo(sim.Config.EchoMemory));
            Assert.That(c.MatchStats.Ecos, Is.EqualTo(1));
        }

        [Test]
        public void Marco_CapturedByPresence_ContestedStops_AndProducesMemory()
        {
            var cfg = new MatchConfig { DespertarDuration = 0.1f, EnvironmentEvents = false, MaxEchoesDespertar = 0, MaxEchoesLater = 0 };
            var sim = new Simulation(cfg);
            var a = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "a", false);
            var marco = sim.Match.Marcos.Single(m => m.Spec.Kind == MarcoKind.Mata);
            sim.Run(0.2f);
            a.Position = marco.Spec.Position;
            sim.Run(100f / cfg.MarcoCaptureRate + 0.5f);
            Assert.That(marco.Owner, Is.EqualTo(Team.Aurora));
            float mem = sim.Match.Memory[0];
            sim.Run(2f);
            Assert.That(sim.Match.Memory[0], Is.GreaterThan(mem + 2f));

            var b = sim.AddChampion(Team.Crepusculo, CharacterId.SaciPerere, "b", false);
            b.Position = marco.Spec.Position + new Vec2(2f, 0f);
            float cap = marco.Capture;
            sim.Run(1f);
            Assert.That(marco.Contested, Is.True);
            Assert.That(marco.Capture, Is.EqualTo(cap));
        }

        [Test]
        public void Heart_ActivationCostsMemory_DominanceWins_AndCanBeDisrupted()
        {
            var cfg = new MatchConfig { DespertarDuration = 0.1f, RessonanciaDuration = 0.1f, EnvironmentEvents = false, HeartDominanceToWin = 10f, MaxEchoesDespertar = 0, MaxEchoesLater = 0 };
            var sim = new Simulation(cfg);
            var a = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "a", false);
            var b = sim.AddChampion(Team.Crepusculo, CharacterId.SaciPerere, "b", false);
            sim.Run(0.5f);
            Assert.That(sim.Match.Phase, Is.EqualTo(MatchPhase.Manifestacao));

            a.Position = sim.Map.HeartPosition;
            sim.Run(cfg.HeartChannelTime + 1f);
            Assert.That(sim.Match.Heart.Owner, Is.EqualTo(Team.None), "sem Memória não ativa");

            sim.Match.AddMemory(Team.Aurora, 120f);
            sim.Run(cfg.HeartChannelTime + 0.2f);
            Assert.That(sim.Match.Heart.Owner, Is.EqualTo(Team.Aurora));
            Assert.That(sim.Match.Memory[0], Is.EqualTo(20f).Within(1f));

            // Inimigo sozinho no Coração por 5 s desfaz a ativação; o Domínio já acumulado permanece.
            sim.Run(3f);
            float dom = sim.Match.Heart.Dominance[0];
            Assert.That(dom, Is.GreaterThan(2f));
            a.Position = new Vec2(-40f, 0f);
            b.Position = sim.Map.HeartPosition;
            sim.Run(cfg.HeartDisruptTime + 0.2f);
            Assert.That(sim.Match.Heart.Owner, Is.EqualTo(Team.None));
            Assert.That(sim.Match.Heart.Dominance[0], Is.EqualTo(dom).Within(0.05f));

            // Reativar e manter até vencer.
            b.Position = new Vec2(40f, 0f);
            a.Position = sim.Map.HeartPosition;
            sim.Match.AddMemory(Team.Aurora, 120f);
            sim.Run(cfg.HeartChannelTime + cfg.HeartDominanceToWin + 1f);
            Assert.That(sim.Match.Phase, Is.EqualTo(MatchPhase.Encerrada));
            Assert.That(sim.Match.Winner, Is.EqualTo(Team.Aurora));
        }

        [Test]
        public void TimeLimit_DecidesByDominanceThenMemory()
        {
            var cfg = new MatchConfig { MaxDuration = 2f, EnvironmentEvents = false, MaxEchoesDespertar = 0 };
            var sim = new Simulation(cfg);
            sim.Match.AddMemory(Team.Crepusculo, 10f);
            sim.Run(3f);
            Assert.That(sim.Match.Winner, Is.EqualTo(Team.Crepusculo));
        }

        [Test]
        public void EnemyAltar_DamagesInvaders_OwnAltarHeals()
        {
            var sim = new Simulation(new MatchConfig { EnvironmentEvents = false });
            var a = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "a", false);
            var b = sim.AddChampion(Team.Crepusculo, CharacterId.SaciPerere, "b", false);
            a.Hp = 100f;
            b.Position = sim.Map.BaseCenter[0];
            sim.Run(1f);
            Assert.That(a.Hp, Is.GreaterThan(200f));
            Assert.That(b.Hp, Is.LessThan(b.MaxHp - 100f));
        }
    }

    public class EnvironmentTests
    {
        [Test]
        public void Events_AreAnnouncedBeforeStarting()
        {
            var sim = new Simulation(new MatchConfig());
            bool warned = false, started = false;
            float warnTime = 0f;
            for (int i = 0; i < (int)(105 * Simulation.TickRate); i++)
            {
                sim.ClearEvents();
                sim.Step();
                foreach (var e in sim.Events)
                {
                    if (e.Type == SimEventType.EnvironmentWarning && e.Text == "Cheia do Rio") { warned = true; warnTime = sim.Time; }
                    if (e.Type == SimEventType.EnvironmentStarted && e.Text == "Cheia do Rio") { started = true; Assert.That(sim.Time - warnTime, Is.EqualTo(10f).Within(0.1f)); }
                }
            }
            Assert.That(warned && started);
        }

        [Test]
        public void Flood_TurnsRiverbankIntoWater_AndSlows()
        {
            var sim = new Simulation(new MatchConfig());
            var c = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "a", false);
            c.Position = new Vec2(-20f, 20f);
            float before = sim.CurrentSpeed(c);
            Assert.That(sim.Map.TerrainAt(c.Position), Is.EqualTo(TerrainKind.Solo));
            sim.Environment.ForceStart(EnvironmentEventKind.CheiaDoRio);
            Assert.That(sim.Map.TerrainAt(c.Position), Is.EqualTo(TerrainKind.Agua));
            Assert.That(sim.CurrentSpeed(c), Is.LessThan(before));
        }

        [Test]
        public void Roots_BlockPassage_AndNavigationAdapts()
        {
            var sim = new Simulation(new MatchConfig());
            var path = new System.Collections.Generic.List<Vec2>();
            Vec2 from = new Vec2(0f, 14f), to = new Vec2(0f, 4f);
            Assert.That(sim.Nav.Walkable(from, to), Is.True);
            sim.Environment.ForceStart(EnvironmentEventKind.RaizesAntigas);
            Assert.That(sim.Nav.Walkable(from, to), Is.False);
            Assert.That(sim.Nav.FindPath(from, to, path), Is.True);
            Assert.That(path.Count, Is.GreaterThan(1), "contorna pelas laterais");
        }

        [Test]
        public void Fog_ReducesVisionInMata()
        {
            var sim = new Simulation(new MatchConfig { EnvironmentEvents = true });
            var a = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "a", false);
            var b = sim.AddChampion(Team.Crepusculo, CharacterId.SaciPerere, "b", false);
            a.Position = new Vec2(-30f, -24f);
            b.Position = new Vec2(-22f, -24f);
            sim.Vision.Recompute();
            Assert.That(sim.Vision.IsVisibleTo(Team.Aurora, b), Is.True);
            sim.Environment.ForceStart(EnvironmentEventKind.NevoaDaMata);
            sim.Vision.Recompute();
            Assert.That(sim.Vision.IsVisibleTo(Team.Aurora, b), Is.False);
        }

        [Test]
        public void Bushes_HideUnits_UntilClose()
        {
            var sim = new Simulation(new MatchConfig { EnvironmentEvents = false });
            var a = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "a", false);
            var b = sim.AddChampion(Team.Crepusculo, CharacterId.SaciPerere, "b", false);
            var bush = sim.Map.Areas.First(x => x.Kind == TerrainKind.Vegetacao && !x.IsBox);
            b.Position = bush.Center;
            a.Position = bush.Center + new Vec2(7f, 0f);
            sim.Vision.Recompute();
            Assert.That(sim.Vision.IsVisibleTo(Team.Aurora, b), Is.False);
            a.Position = bush.Center + new Vec2(3f, 0f);
            sim.Vision.Recompute();
            Assert.That(sim.Vision.IsVisibleTo(Team.Aurora, b), Is.True);
        }

        [Test]
        public void Spirits_DropEchoesWhenDefeated()
        {
            var sim = new Simulation(new MatchConfig { EnvironmentEvents = false, MaxEchoesDespertar = 0 });
            var a = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "a", false);
            var s = NeutralAI.Spawn(sim, new Vec2(-20f, 0f));
            sim.DealDamage(a, s, 1000f);
            Assert.That(s.Alive, Is.False);
            Assert.That(sim.Echoes.Count, Is.EqualTo(3));
            Assert.That(sim.Match.Memory[0], Is.EqualTo(3f));
        }
    }

    public class SynergyTests
    {
        private static Simulation Pair(out Champion saci, out Champion boi, out Champion enemy)
        {
            var sim = new Simulation(new MatchConfig { EnvironmentEvents = false, DespertarDuration = 9999f, MaxEchoesDespertar = 0 });
            saci = sim.AddChampion(Team.Aurora, CharacterId.SaciPerere, "saci", false);
            boi = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "boi", false);
            enemy = sim.AddChampion(Team.Crepusculo, CharacterId.Boitata, "inimigo", false);
            saci.Position = new Vec2(-30f, 0f);
            boi.Position = new Vec2(-30f, 4f);
            enemy.Position = new Vec2(-24f, 0f);
            return sim;
        }

        [Test]
        public void TempestadeDeBrasas_TriggersWhenTornadoCrossesAlliedFire_WithCooldown()
        {
            var sim = Pair(out var saci, out var boi, out var enemy);
            sim.AddZone(ZoneKind.RastroDeFogo, boi, new Vec2(-28f, 0f), 1.3f, 3.5f);
            TestUtil.Press(sim, saci, CommandButtons.Habilidade1, enemy.Position);
            TestUtil.Hold(sim, saci, Vec2.Right, enemy.Position, 0.6f);
            Assert.That(sim.Zones.Any(z => z.Kind == ZoneKind.TempestadeDeBrasas), Is.True);
            Assert.That(saci.MatchStats.Synergies, Is.EqualTo(1));
            Assert.That(boi.MatchStats.Synergies, Is.EqualTo(1));
            Assert.That(sim.Synergy.IsReady(Team.Aurora, SynergySystem.TempestadeDeBrasas), Is.False);
            Assert.That(sim.Synergy.IsReady(Team.Aurora, SynergySystem.BrasaAoVento), Is.False, "bloqueio global da equipe evita encadear");
        }

        [Test]
        public void TempestadeDeBrasas_RequiresAlliedFire()
        {
            var sim = Pair(out var saci, out _, out var enemy);
            sim.AddZone(ZoneKind.RastroDeFogo, enemy, new Vec2(-28f, 0f), 1.3f, 3.5f);
            TestUtil.Press(sim, saci, CommandButtons.Habilidade1, enemy.Position);
            TestUtil.Hold(sim, saci, Vec2.Right, enemy.Position, 0.6f);
            Assert.That(sim.Zones.Any(z => z.Kind == ZoneKind.TempestadeDeBrasas), Is.False);
        }

        [Test]
        public void BrasaAoVento_BurnsEveryoneHitByWindThroughFire()
        {
            var sim = Pair(out var saci, out var boi, out var enemy);
            sim.AddZone(ZoneKind.RastroDeFogo, boi, new Vec2(-27f, 0f), 1.3f, 3.5f);
            TestUtil.Press(sim, saci, CommandButtons.Habilidade3, enemy.Position);
            Assert.That(enemy.Status.Has(StatusType.Queimadura), Is.True);
            Assert.That(sim.Events.Any(e => e.Type == SimEventType.SynergyTriggered && e.Text == "Brasa ao Vento"));
        }
    }

    public class NavigationTests
    {
        [Test]
        public void Path_AvoidsObstacles()
        {
            var sim = new Simulation(new MatchConfig());
            var path = new System.Collections.Generic.List<Vec2>();
            Assert.That(sim.Nav.FindPath(sim.Map.BaseCenter[0], sim.Map.BaseCenter[1], path), Is.True);
            Vec2 prev = sim.Map.BaseCenter[0];
            foreach (var p in path)
            {
                Assert.That(sim.Nav.Walkable(prev, p), Is.True);
                prev = p;
            }
        }
    }

    public class ProgressionTests
    {
        [Test]
        public void Mastery_GrantsXpLevelsChallengesAndUnlocks_NoPowerGain()
        {
            var m = new CharacterMastery { Character = CharacterId.SaciPerere };
            var stats = new MatchStats { Kills = 5, Assists = 4, Ecos = 12, ObjectiveSeconds = 120f };
            stats.Count("saci_trocas_arriscadas", 10);
            var r = MasteryRules.Apply(m, stats, true, 10f);
            Assert.That(r.XpGained, Is.GreaterThan(300));
            Assert.That(r.ChallengesCompleted.Any(c => c.Id == "saci_trocas"));
            Assert.That(r.LevelAfter, Is.GreaterThan(r.LevelBefore));
            Assert.That(r.Unlocked.Any(u => u.Kind == UnlockKind.Historia));
            // Os atributos de combate não dependem de progressão.
            Assert.That(CharacterCatalog.CreateStats(CharacterId.SaciPerere).MaxHp, Is.EqualTo(580f));
        }
    }
}
