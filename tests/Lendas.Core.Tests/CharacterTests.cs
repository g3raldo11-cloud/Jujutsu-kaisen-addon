using System.Linq;
using Lendas.Core;
using NUnit.Framework;

namespace Lendas.Core.Tests
{
    public class SaciTests
    {
        [Test]
        public void Travessura_StacksOnDirectionChanges_AndDecays()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out _);
            var kit = (SaciKit)saci.Kit;
            Vec2[] dirs = { Vec2.Up, Vec2.Right, -Vec2.Up, -Vec2.Right, Vec2.Up };
            foreach (var d in dirs) TestUtil.Hold(sim, saci, d, saci.Position + d, 0.35f);
            Assert.That(kit.TravessuraStacks, Is.EqualTo(SaciKit.MaxStacks));
            Assert.That(kit.SpeedMultiplier, Is.EqualTo(1f + SaciKit.StackSpeed * 4).Within(0.001f));
            TestUtil.Hold(sim, saci, Vec2.Up, saci.Position + Vec2.Up, 2.2f);
            Assert.That(kit.TravessuraStacks, Is.EqualTo(0));
        }

        [Test]
        public void Redemoinho_IsFaster_HitsOnce_AndLeavesAnchor()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            var kit = (SaciKit)saci.Kit;
            float baseSpeed = sim.CurrentSpeed(saci);
            TestUtil.Press(sim, saci, CommandButtons.Habilidade1, boi.Position);
            Assert.That(kit.IsTornado, Is.True);
            Assert.That(sim.CurrentSpeed(saci), Is.GreaterThan(baseSpeed * 1.7f));
            float hp = boi.Hp;
            TestUtil.Hold(sim, saci, Vec2.Right, boi.Position, 1.9f);
            Assert.That(hp - boi.Hp, Is.EqualTo(70f).Within(1f), "um acerto por alvo");
            Assert.That(kit.IsTornado, Is.False);
            Assert.That(sim.Zones.Any(z => z.Kind == ZoneKind.RedemoinhoAncora && z.OwnerId == saci.Id), Is.True);
        }

        [Test]
        public void TrocaTroca_SwapsWithIllusion_AndIllusionFoolsEnemyVision()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            var start = saci.Position;
            TestUtil.Press(sim, saci, CommandButtons.Habilidade2, start + new Vec2(0f, 9f));
            var decoy = sim.Decoys.Single();
            Assert.That(decoy.Character, Is.EqualTo(CharacterId.SaciPerere));
            sim.Vision.Recompute();
            Assert.That(sim.Vision.IsVisibleTo(Team.Crepusculo, decoy), Is.True);
            TestUtil.Hold(sim, saci, Vec2.Zero, saci.Position, 1.5f);
            Assert.That(saci.Position.Y - start.Y, Is.GreaterThan(5f), "Saci foi para onde a ilusão estava");
        }

        [Test]
        public void TrocaTroca_EarlyRecast()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out _);
            var start = saci.Position;
            TestUtil.Press(sim, saci, CommandButtons.Habilidade2, start + new Vec2(0f, 9f));
            TestUtil.Hold(sim, saci, Vec2.Zero, saci.Position, 0.5f);
            sim.ClearEvents();
            TestUtil.Press(sim, saci, CommandButtons.Habilidade2, saci.Position);
            Assert.That(sim.Events.Any(e => e.Type == SimEventType.Swap), Is.True);
            Assert.That(saci.Position.Y - start.Y, Is.GreaterThan(2f));
        }

        [Test]
        public void HittingIllusion_BreaksItWithoutDamage()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            var d = sim.AddDecoy(saci, boi.Position + new Vec2(1.5f, 0f), Vec2.Up, 0f, 3f);
            TestUtil.Hold(sim, boi, Vec2.Zero, d.Position, 0.1f, attack: true);
            Assert.That(d.Alive, Is.False);
            Assert.That(saci.Hp, Is.EqualTo(saci.MaxHp));
        }

        [Test]
        public void VentoTravesso_PushesAndAppliesWind()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            var before = boi.Position;
            TestUtil.Press(sim, saci, CommandButtons.Habilidade3, boi.Position);
            Assert.That(boi.Status.Has(StatusType.Ventania), Is.True);
            TestUtil.Hold(sim, saci, Vec2.Zero, boi.Position, 0.4f);
            Assert.That(boi.Position.X - before.X, Is.GreaterThan(3f));
        }

        [Test]
        public void ReinoDosRedemoinhos_SlowsAndAllowsBlinkBetweenAnchors()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            saci.UltCharge = 100f;
            TestUtil.Press(sim, saci, CommandButtons.Suprema, saci.Position);
            var kit = (SaciKit)saci.Kit;
            Assert.That(kit.RealmActive, Is.True);
            TestUtil.Hold(sim, saci, Vec2.Zero, saci.Position, 0.3f);
            Assert.That(boi.Status.Has(StatusType.Lentidao), Is.True);
            var from = saci.Position;
            sim.ClearEvents();
            TestUtil.Press(sim, saci, CommandButtons.Suprema, saci.Position + new Vec2(0f, 6f));
            Assert.That(sim.Events.Any(e => e.Type == SimEventType.Blink), Is.True);
            Assert.That(Vec2.Distance(from, saci.Position), Is.GreaterThan(3f));
            Assert.That(saci.MatchStats.Get("saci_saltos"), Is.EqualTo(1));
        }
    }

    public class BoitataTests
    {
        [Test]
        public void Heat_GrowsWhileMoving_DecaysWhileStill_AndBoostsDamage()
        {
            var sim = TestUtil.Duel(CharacterId.Boitata, CharacterId.SaciPerere, out var boi, out _);
            var kit = (BoitataKit)boi.Kit;
            TestUtil.Hold(sim, boi, Vec2.Up, boi.Position + Vec2.Up, 5f);
            Assert.That(kit.Heat, Is.GreaterThan(60f));
            Assert.That(kit.DamageMultiplier, Is.GreaterThan(1.12f));
            TestUtil.Hold(sim, boi, Vec2.Zero, boi.Position, 4f);
            Assert.That(kit.Heat, Is.LessThan(10f));
        }

        [Test]
        public void Body_IsSegmented_AndFollowsHeadPath()
        {
            var sim = TestUtil.Duel(CharacterId.Boitata, CharacterId.SaciPerere, out var boi, out _);
            var kit = (BoitataKit)boi.Kit;
            TestUtil.Hold(sim, boi, Vec2.Up, boi.Position + Vec2.Up, 2f);
            TestUtil.Hold(sim, boi, Vec2.Right, boi.Position + Vec2.Right, 0.6f);
            Assert.That(kit.Segments.Count, Is.EqualTo(BoitataKit.BaseSegments));
            // Os segmentos não estão todos numa reta: parte ainda segue o trecho vertical.
            var last = kit.Segments[kit.Segments.Count - 1];
            Assert.That(last.X, Is.LessThan(boi.Position.X - 1f));
            Assert.That(last.Y, Is.LessThan(boi.Position.Y - 0.5f));
            for (int i = 1; i < kit.Segments.Count; i++)
                Assert.That(Vec2.Distance(kit.Segments[i - 1], kit.Segments[i]), Is.LessThan(BoitataKit.SegmentSpacing * 1.6f));
        }

        [Test]
        public void HotBody_BlocksAndBurnsEnemies()
        {
            var sim = TestUtil.Duel(CharacterId.Boitata, CharacterId.SaciPerere, out var boi, out var saci);
            var kit = (BoitataKit)boi.Kit;
            TestUtil.Hold(sim, boi, Vec2.Up, boi.Position + Vec2.Up, 6f);
            Assert.That(kit.Heat, Is.GreaterThanOrEqualTo(BoitataKit.BurningBodyHeat));
            var seg = kit.Segments[3];
            saci.Position = seg;
            sim.SetCommand(boi.Id, new PlayerCommand { Move = Vec2.Up, AimPoint = boi.Position + Vec2.Up });
            sim.Step();
            float minDist = kit.Segments.Min(s => Vec2.Distance(s, saci.Position));
            Assert.That(minDist, Is.GreaterThanOrEqualTo(BoitataKit.SegmentRadius + saci.Radius - 0.25f), $"empurrado para fora do corpo; saci={saci.Position} cabeça={boi.Position} segs={string.Join(" ", kit.Segments)}");
            Assert.That(saci.Status.Has(StatusType.Queimadura), Is.True);
            Assert.That(boi.MatchStats.Get("boitata_queimaduras_corpo"), Is.GreaterThan(0));
        }

        [Test]
        public void InvestidaFlamejante_TravelsAndDamages()
        {
            var sim = TestUtil.Duel(CharacterId.Boitata, CharacterId.SaciPerere, out var boi, out var saci);
            var start = boi.Position;
            float hp = saci.Hp;
            TestUtil.Press(sim, boi, CommandButtons.Habilidade1, saci.Position);
            TestUtil.Hold(sim, boi, Vec2.Zero, saci.Position, 0.7f);
            Assert.That(boi.Position.X - start.X, Is.GreaterThan(6f));
            Assert.That(saci.Hp, Is.LessThan(hp - 60f));
        }

        [Test]
        public void OlharIncandescente_BlindsMakesBasicAttacksMiss_AndReducesVision()
        {
            var sim = TestUtil.Duel(CharacterId.Boitata, CharacterId.SaciPerere, out var boi, out var saci);
            TestUtil.Press(sim, boi, CommandButtons.Habilidade2, saci.Position);
            Assert.That(saci.Status.Has(StatusType.Ofuscado), Is.True);
            boi.Position = saci.Position + new Vec2(-1.2f, 0f);
            float hp = boi.Hp;
            TestUtil.Hold(sim, saci, Vec2.Zero, boi.Position, 0.1f, attack: true);
            Assert.That(boi.Hp, Is.EqualTo(hp));
            Assert.That(sim.Events.Any(e => e.Type == SimEventType.BasicMiss), Is.True);
            boi.Position = saci.Position + new Vec2(-6f, 0f);
            sim.Vision.Recompute();
            Assert.That(sim.Vision.IsVisibleTo(Team.Crepusculo, boi), Is.False, "Ofuscado só enxerga 3 m");
        }

        [Test]
        public void RastroDeFogo_LeavesBurningTrail()
        {
            var sim = TestUtil.Duel(CharacterId.Boitata, CharacterId.SaciPerere, out var boi, out _);
            TestUtil.Press(sim, boi, CommandButtons.Habilidade3, boi.Position);
            TestUtil.Hold(sim, boi, Vec2.Up, boi.Position + Vec2.Up, 2f);
            Assert.That(sim.Zones.Count(z => z.Kind == ZoneKind.RastroDeFogo), Is.GreaterThanOrEqualTo(4));
        }

        [Test]
        public void Suprema_GiantFormIsUnstoppableAndLonger()
        {
            var sim = TestUtil.Duel(CharacterId.Boitata, CharacterId.SaciPerere, out var boi, out var saci);
            boi.UltCharge = 100f;
            TestUtil.Press(sim, boi, CommandButtons.Suprema, boi.Position);
            var kit = (BoitataKit)boi.Kit;
            Assert.That(kit.GiantForm, Is.True);
            Assert.That(sim.ApplyStatus(boi, StatusType.Atordoado, 1f, 1f, saci), Is.False);
            TestUtil.Hold(sim, boi, Vec2.Up, boi.Position + Vec2.Up, 1f);
            Assert.That(kit.Segments.Count, Is.EqualTo(BoitataKit.GiantSegments));
            Assert.That(saci.Hp, Is.LessThan(saci.MaxHp), "onda de fogo atinge quem está a menos de 5 m");
        }
    }
}
