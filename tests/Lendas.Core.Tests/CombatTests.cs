using System.Linq;
using Lendas.Core;
using NUnit.Framework;

namespace Lendas.Core.Tests
{
    public class CombatTests
    {
        [Test]
        public void BasicAttack_DamagesEnemyInArc_AndRespectsInterval()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            boi.Position = saci.Position + new Vec2(1.5f, 0f);
            float hp = boi.Hp;
            TestUtil.Hold(sim, saci, Vec2.Zero, boi.Position, 0.1f, attack: true);
            Assert.That(boi.Hp, Is.EqualTo(hp - saci.Stats.BasicDamage).Within(0.5f));
            // Ainda no intervalo: não causa dano extra.
            TestUtil.Hold(sim, saci, Vec2.Zero, boi.Position, 0.3f, attack: true);
            Assert.That(boi.Hp, Is.EqualTo(hp - saci.Stats.BasicDamage).Within(0.5f));
        }

        [Test]
        public void BasicAttack_MissesBehind()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            boi.Position = saci.Position + new Vec2(1.5f, 0f);
            float hp = boi.Hp;
            TestUtil.Hold(sim, saci, Vec2.Zero, saci.Position - new Vec2(3f, 0f), 0.1f, attack: true);
            Assert.That(boi.Hp, Is.EqualTo(hp));
        }

        [Test]
        public void Dodge_GrantsInvulnerability_AndMoves()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            var start = saci.Position;
            TestUtil.Press(sim, saci, CommandButtons.Esquiva, saci.Position, new Vec2(0f, 1f));
            Assert.That(saci.InvulnerableTime, Is.GreaterThan(0f));
            Assert.That(sim.DealDamage(boi, saci, 100f), Is.EqualTo(0f));
            TestUtil.Hold(sim, saci, Vec2.Zero, saci.Position, 0.3f);
            Assert.That(Vec2.Distance(start, saci.Position), Is.GreaterThan(4f));
            Assert.That(saci.DodgeCooldown, Is.GreaterThan(0f));
        }

        [Test]
        public void Jump_AvoidsGroundFire()
        {
            var sim = TestUtil.Duel(CharacterId.Boitata, CharacterId.SaciPerere, out var boi, out var saci);
            sim.AddZone(ZoneKind.RastroDeFogo, boi, saci.Position, 2f, 3f);
            TestUtil.Press(sim, saci, CommandButtons.Salto, saci.Position);
            float hp = saci.Hp;
            TestUtil.Hold(sim, saci, Vec2.Zero, saci.Position, 0.5f);
            Assert.That(saci.Hp, Is.EqualTo(hp));
            TestUtil.Hold(sim, saci, Vec2.Zero, saci.Position, 1f);
            Assert.That(saci.Hp, Is.LessThan(hp));
        }

        [Test]
        public void Sprint_IsFasterAndDrainsStamina()
        {
            var sim = TestUtil.Duel(CharacterId.Boitata, CharacterId.SaciPerere, out var boi, out _);
            float normal = sim.CurrentSpeed(boi);
            sim.SetCommand(boi.Id, new PlayerCommand { Move = Vec2.Up, Sprint = true, AimPoint = boi.Position + Vec2.Up });
            sim.Step();
            Assert.That(boi.Sprinting, Is.True);
            Assert.That(sim.CurrentSpeed(boi), Is.GreaterThan(normal * 1.2f));
            Assert.That(boi.Stamina, Is.LessThan(100f));
        }

        [Test]
        public void Shield_AbsorbsDamage()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            sim.ApplyStatus(boi, StatusType.Escudo, 5f, 50f, null);
            float hp = boi.Hp;
            sim.DealDamage(saci, boi, 80f);
            Assert.That(boi.Hp, Is.EqualTo(hp - 30f).Within(0.01f));
        }

        [Test]
        public void Stun_InterruptsAndBlocksActions()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out var boi);
            saci.CastLock = 1f;
            sim.ApplyStatus(saci, StatusType.Atordoado, 1f, 1f, boi);
            Assert.That(saci.CastLock, Is.EqualTo(0f));
            Assert.That(saci.CanAct, Is.False);
            Assert.That(sim.Events.Any(e => e.Type == SimEventType.Interrupted), Is.True);
        }

        [Test]
        public void Death_RespawnsAtBase_AndCreditsKillerAndAssist()
        {
            var cfg = new MatchConfig { EnvironmentEvents = false };
            var sim = new Simulation(cfg);
            var a1 = sim.AddChampion(Team.Aurora, CharacterId.SaciPerere, "a1", false);
            var a2 = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "a2", false);
            var b = sim.AddChampion(Team.Crepusculo, CharacterId.SaciPerere, "b", false);
            b.Position = new Vec2(-20f, 0f);
            sim.DealDamage(a2, b, 100f);
            sim.DealDamage(a1, b, 10000f);
            Assert.That(b.Alive, Is.False);
            Assert.That(a1.MatchStats.Kills, Is.EqualTo(1));
            Assert.That(a2.MatchStats.Assists, Is.EqualTo(1));
            Assert.That(sim.Match.Memory[0], Is.EqualTo(cfg.KillMemory));
            sim.Run(cfg.RespawnBase + 0.5f);
            Assert.That(b.Alive, Is.True);
            Assert.That(Vec2.Distance(b.Position, sim.Map.BaseCenter[1]), Is.LessThan(sim.Map.BaseRadius));
        }

        [Test]
        public void FriendlyFire_IsDisabled()
        {
            var sim = new Simulation(new MatchConfig { EnvironmentEvents = false });
            var a1 = sim.AddChampion(Team.Aurora, CharacterId.SaciPerere, "a1", false);
            var a2 = sim.AddChampion(Team.Aurora, CharacterId.Boitata, "a2", false);
            Assert.That(sim.DealDamage(a1, a2, 100f), Is.EqualTo(0f));
            Assert.That(sim.ApplyStatus(a2, StatusType.Atordoado, 1f, 1f, a1), Is.False);
        }

        [Test]
        public void Cooldowns_AndEnergy_AreEnforced()
        {
            var sim = TestUtil.Duel(CharacterId.SaciPerere, CharacterId.Boitata, out var saci, out _);
            Assert.That(sim.TryCast(saci, AbilitySlot.Habilidade3, saci.Position + Vec2.Right), Is.True);
            Assert.That(sim.TryCast(saci, AbilitySlot.Habilidade3, saci.Position + Vec2.Right), Is.False, "em recarga");
            saci.Energy = 0f;
            Assert.That(sim.TryCast(saci, AbilitySlot.Habilidade1, saci.Position + Vec2.Right), Is.False, "sem energia");
            saci.Energy = 100f;
            Assert.That(sim.TryCast(saci, AbilitySlot.Suprema, saci.Position), Is.False, "suprema sem carga");
        }
    }
}
