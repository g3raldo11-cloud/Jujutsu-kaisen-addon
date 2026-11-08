using Lendas.Core;

namespace Lendas.Core.Tests
{
    internal static class TestUtil
    {
        /// <summary>Simulação sem eventos ambientais, com dois jogadores "humanos" controlados pelo teste.</summary>
        public static Simulation Duel(CharacterId a, CharacterId b, out Champion ca, out Champion cb, MatchConfig cfg = null)
        {
            cfg ??= new MatchConfig { EnvironmentEvents = false, DespertarDuration = 9999f };
            var sim = new Simulation(cfg);
            ca = sim.AddChampion(Team.Aurora, a, "A", false);
            cb = sim.AddChampion(Team.Crepusculo, b, "B", false);
            // Em campo aberto, perto do centro-oeste (sem obstáculos entre eles).
            ca.Position = new Vec2(-30f, 0f);
            cb.Position = new Vec2(-26f, 0f);
            return sim;
        }

        public static void Press(Simulation sim, Champion c, CommandButtons b, Vec2 aim, Vec2 move = default)
        {
            sim.SetCommand(c.Id, new PlayerCommand { Pressed = b, AimPoint = aim, Move = move });
            sim.Step();
        }

        public static void Hold(Simulation sim, Champion c, Vec2 move, Vec2 aim, float seconds, bool attack = false)
        {
            int ticks = (int)(seconds * Simulation.TickRate);
            for (int i = 0; i < ticks; i++)
            {
                sim.SetCommand(c.Id, new PlayerCommand { Move = move, AimPoint = aim, Attack = attack });
                sim.Step();
            }
        }

        public static Simulation FullBotMatch(uint seed, MatchConfig cfg = null)
        {
            cfg ??= new MatchConfig();
            cfg.Seed = seed;
            var sim = new Simulation(cfg);
            for (int t = 0; t < 2; t++)
                for (int i = 0; i < 5; i++)
                    sim.AddChampion((Team)t, i % 2 == (t == 0 ? 0 : 1) ? CharacterId.SaciPerere : CharacterId.Boitata, $"Bot{t}{i}", true);
            return sim;
        }
    }
}
