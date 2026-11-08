using System.Linq;
using Lendas.Core;
using NUnit.Framework;

namespace Lendas.Core.Tests
{
    public class CurupiraTests
    {
        [Test]
        public void CombustaoNatural_HitsBuildHeat_HeatCools_AndHotAddsFire()
        {
            var sim = TestUtil.Duel(CharacterId.Curupira, CharacterId.Boitata, out var cur, out var boi);
            var kit = (CurupiraKit)cur.Kit;
            boi.Position = cur.Position + new Vec2(1.5f, 0f);
            boi.MaxHp = boi.Hp = 99999f;
            TestUtil.Hold(sim, cur, Vec2.Zero, boi.Position, 3.5f, attack: true);
            Assert.That(kit.Heat, Is.GreaterThanOrEqualTo(CurupiraKit.HotThreshold));
            Assert.That(kit.IsHot, Is.True);
            Assert.That(boi.Status.Has(StatusType.Queimadura), Is.True, "quente: ataques incendeiam");
            Assert.That(kit.SpeedMultiplier, Is.GreaterThan(1f));
            float heat = kit.Heat;
            TestUtil.Hold(sim, cur, Vec2.Zero, cur.Position - new Vec2(5f, 0f), 5f);
            Assert.That(kit.Heat, Is.LessThan(heat - 15f), "esfria sem acertar");
        }

        [Test]
        public void ChamasInvertidas_FiresSinuousSequence_CountScalesWithHeat()
        {
            var sim = TestUtil.Duel(CharacterId.Curupira, CharacterId.Boitata, out var cur, out var boi);
            var kit = (CurupiraKit)cur.Kit;
            boi.Position = cur.Position + new Vec2(8f, 0f);
            boi.MaxHp = boi.Hp = 99999f;
            TestUtil.Press(sim, cur, CommandButtons.Habilidade1, boi.Position);
            bool sawLateral = false;
            int hits = 0;
            for (int i = 0; i < 40; i++)
            {
                sim.ClearEvents();
                sim.SetCommand(cur.Id, new PlayerCommand { AimPoint = boi.Position });
                sim.Step();
                foreach (var f in kit.Flames) if (System.Math.Abs(f.Position.Y - cur.Position.Y) > 0.5f) sawLateral = true;
                hits += sim.Events.Count(e => e.Type == SimEventType.ProjectileHit);
            }
            Assert.That(sawLateral, Is.True, "trajetória sinuosa");
            Assert.That(hits, Is.GreaterThanOrEqualTo(2));
        }

        [Test]
        public void PassosIncandescentes_DashesAndFootprintsExplode()
        {
            var sim = TestUtil.Duel(CharacterId.Curupira, CharacterId.Boitata, out var cur, out var boi);
            var start = cur.Position;
            boi.Position = start + new Vec2(3f, 1f);
            float hp = boi.Hp;
            TestUtil.Press(sim, cur, CommandButtons.Habilidade2, start + new Vec2(7f, 0f));
            TestUtil.Hold(sim, cur, Vec2.Zero, cur.Position, 0.5f);
            Assert.That(cur.Position.X - start.X, Is.GreaterThan(5f));
            Assert.That(sim.Zones.Count(z => z.Kind == ZoneKind.PegadaIncandescente), Is.GreaterThanOrEqualTo(4));
            Assert.That(boi.Hp, Is.EqualTo(hp), "ainda não explodiu");
            boi.Position = start + new Vec2(3f, 1f);
            TestUtil.Hold(sim, cur, Vec2.Zero, cur.Position, 1.6f);
            Assert.That(boi.Hp, Is.LessThan(hp - 40f));
            Assert.That(sim.Zones.Any(z => z.Kind == ZoneKind.PegadaIncandescente), Is.False);
        }

        [Test]
        public void FogoGuardiao_RingBurnsAndRepelsCrossers()
        {
            var sim = TestUtil.Duel(CharacterId.Curupira, CharacterId.Boitata, out var cur, out var boi);
            TestUtil.Press(sim, cur, CommandButtons.Habilidade3, cur.Position);
            var ring = sim.Zones.Single(z => z.Kind == ZoneKind.CirculoDeFogo);
            boi.Position = ring.Position + new Vec2(ring.Radius + 2f, 0f);
            float hp = boi.Hp;
            // O inimigo tenta entrar no círculo.
            for (int i = 0; i < 60; i++)
            {
                sim.SetCommand(boi.Id, new PlayerCommand { Move = -Vec2.Right, AimPoint = ring.Position });
                sim.Step();
            }
            Assert.That(Vec2.Distance(boi.Position, ring.Position), Is.GreaterThan(ring.Radius - 0.5f), "não consegue atravessar");
            Assert.That(boi.Hp, Is.LessThan(hp));
        }

        [Test]
        public void IraDoCurupira_ExplodesAndJetsFollowAim()
        {
            var sim = TestUtil.Duel(CharacterId.Curupira, CharacterId.Boitata, out var cur, out var boi);
            var kit = (CurupiraKit)cur.Kit;
            cur.UltCharge = 100f;
            boi.Position = cur.Position + new Vec2(3f, 0f);
            boi.MaxHp = boi.Hp = 99999f;
            float hp = boi.Hp;
            TestUtil.Press(sim, cur, CommandButtons.Suprema, boi.Position);
            Assert.That(hp - boi.Hp, Is.GreaterThanOrEqualTo(120f));
            Assert.That(kit.WrathActive, Is.True);
            // Mira para o norte: as labaredas seguem a mira.
            boi.Position = cur.Position + new Vec2(0f, 6f);
            boi.ForcedTime = 0f; // anula o empurrão da explosão
            TestUtil.Hold(sim, cur, Vec2.Zero, cur.Position + new Vec2(0f, 5f), 0.1f);
            Assert.That(kit.JetDirection.Y, Is.GreaterThan(0.9f));
            float before = boi.Hp;
            TestUtil.Hold(sim, cur, Vec2.Zero, cur.Position + new Vec2(0f, 5f), 1.2f);
            Assert.That(boi.Hp, Is.LessThan(before - 30f));
        }

        [Test]
        public void Curupira_FireFeedsSaciSynergy()
        {
            var sim = new Simulation(new MatchConfig { EnvironmentEvents = false, DespertarDuration = 9999f, MaxEchoesDespertar = 0 });
            var saci = sim.AddChampion(Team.Aurora, CharacterId.SaciPerere, "saci", false);
            var cur = sim.AddChampion(Team.Aurora, CharacterId.Curupira, "cur", false);
            var enemy = sim.AddChampion(Team.Crepusculo, CharacterId.Boitata, "e", false);
            saci.Position = new Vec2(-30f, 0f); cur.Position = new Vec2(-30f, 5f); enemy.Position = new Vec2(-20f, 0f);
            sim.AddZone(ZoneKind.CirculoDeFogo, cur, new Vec2(-27f, 0f), 2f, 5f);
            TestUtil.Press(sim, saci, CommandButtons.Habilidade1, enemy.Position);
            TestUtil.Hold(sim, saci, Vec2.Right, enemy.Position, 0.6f);
            Assert.That(sim.Zones.Any(z => z.Kind == ZoneKind.TempestadeDeBrasas));
        }
    }
}
