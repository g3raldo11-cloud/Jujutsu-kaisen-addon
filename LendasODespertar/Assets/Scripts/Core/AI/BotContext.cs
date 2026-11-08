using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>Percepção e atuadores de um bot num instante de decisão. Kits usam para escolher habilidades.</summary>
    public sealed class BotContext
    {
        public Simulation Sim;
        public Champion Self;
        public Unit Target;
        public float TargetDistance;
        public readonly List<Unit> VisibleEnemies = new List<Unit>();
        public int EnemiesNear;
        public int AlliesNear;
        public bool Retreating;
        public Vec2 Objective;

        internal PlayerCommand Command;
        internal bool UsedAbility;
        internal Vec2? MoveOverride;

        public bool Ready(AbilitySlot slot) => !UsedAbility && Sim.CanCast(Self, slot);

        public void Use(AbilitySlot slot, Vec2 aimPoint)
        {
            if (UsedAbility) return;
            UsedAbility = true;
            Command.Pressed |= PlayerCommand.ButtonFor(slot);
            Command.AimPoint = aimPoint;
        }

        public bool Chance(float p) => Sim.Random.NextFloat() < p;

        public void MoveTowards(Vec2 point)
        {
            Vec2 d = point - Self.Position;
            MoveOverride = d.SqrLength > 0.01f ? d.Normalized : Vec2.Zero;
        }

        /// <summary>Circula em volta de um ponto (mantém o Boitatá em movimento, por exemplo).</summary>
        public void Strafe(Vec2 around, float bias)
        {
            Vec2 to = (around - Self.Position).Normalized;
            MoveOverride = (to.Perpendicular + to * bias).Normalized;
        }
    }
}
