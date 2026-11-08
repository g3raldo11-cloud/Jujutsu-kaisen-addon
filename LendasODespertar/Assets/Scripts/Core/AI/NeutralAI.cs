namespace Lendas.Core
{
    /// <summary>IA das Assombrações (entidades neutras): guardam seu território e reagem a quem as provoca.</summary>
    public static class NeutralAI
    {
        public static NeutralSpirit Spawn(Simulation sim, Vec2 pos)
        {
            var s = new NeutralSpirit
            {
                Id = sim.NextId(),
                Team = Team.None,
                Position = pos,
                Home = pos,
                Radius = 0.6f,
                MaxHp = 320f,
                Hp = 320f,
            };
            sim.Spirits.Add(s);
            sim.Emit(SimEventType.SpiritSpawned, 0, s.Id, pos);
            return s;
        }

        public static void Tick(Simulation sim, float dt)
        {
            for (int i = sim.Spirits.Count - 1; i >= 0; i--)
            {
                var s = sim.Spirits[i];
                if (!s.Alive) { sim.Spirits.RemoveAt(i); continue; }
                if (s.AttackCooldown > 0f) s.AttackCooldown -= dt;

                var target = sim.FindChampion(s.TargetId);
                if (target == null || !target.Alive || Vec2.Distance(s.Home, target.Position) > s.LeashRadius)
                {
                    s.TargetId = -1;
                    target = null;
                    // Provocação por proximidade.
                    foreach (var c in sim.Champions)
                        if (c.Alive && Vec2.Distance(c.Position, s.Position) < 3f) { s.TargetId = c.Id; target = c; break; }
                }

                if (target == null)
                {
                    Vec2 toHome = s.Home - s.Position;
                    s.Velocity = toHome.SqrLength > 0.25f ? toHome.Normalized * s.Speed : Vec2.Zero;
                    if (toHome.SqrLength < 1f) s.Hp = System.MathF.Min(s.MaxHp, s.Hp + 40f * dt);
                }
                else
                {
                    Vec2 to = target.Position - s.Position;
                    float dist = to.Length;
                    if (dist > 1.6f) s.Velocity = to.Normalized * s.Speed;
                    else
                    {
                        s.Velocity = Vec2.Zero;
                        if (s.AttackCooldown <= 0f)
                        {
                            s.AttackCooldown = 1.2f;
                            sim.DealDamage(null, target, s.Damage);
                        }
                    }
                }
                sim.MoveUnit(s, dt);
            }
        }

        public static void Defeat(Simulation sim, NeutralSpirit s)
        {
            s.Alive = false;
            var killer = sim.FindChampion(s.LastHitterId);
            if (killer != null) sim.Match.AddMemory(killer.Team, 3f);
            for (int k = 0; k < 3; k++) sim.Match.SpawnEcho(s.Position + Vec2.FromAngle(k * 2.09f) * 1.5f);
            sim.Emit(SimEventType.SpiritDefeated, killer?.Id ?? 0, s.Id, s.Position, 0f, null, killer?.Team ?? Team.None);
        }
    }
}
