using System;
using System.Linq;
using Lendas.Core;

// Ferramenta de balanceamento: roda muitas partidas de bots e mede vitórias por lado e por composição,
// além do desempenho médio de cada entidade. Uso: dotnet run -- [partidas]
int n = args.Length > 0 ? int.Parse(args[0]) : 40;
string mode = args.Length > 1 ? args[1] : "mix";
int[] wins = new int[3];
var dmg = new System.Collections.Generic.Dictionary<CharacterId, (double dmg, double kd, int k, int d, int count)>();
double totalTime = 0;
for (int s = 0; s < n; s++)
{
    var sim = new Simulation(new MatchConfig { Seed = (uint)(1000 + s) });
    for (int t = 0; t < 2; t++)
        for (int i = 0; i < 5; i++)
        {
            CharacterId id = mode switch
            {
                "saci" => CharacterId.SaciPerere,
                "boitata" => CharacterId.Boitata,
                "sacivsboi" => t == 0 ? CharacterId.SaciPerere : CharacterId.Boitata,
                "boivssaci" => t == 0 ? CharacterId.Boitata : CharacterId.SaciPerere,
                "tri" => (CharacterId)(i % 3),
                "curvsboi" => t == 0 ? CharacterId.Curupira : CharacterId.Boitata,
                "curvssaci" => t == 0 ? CharacterId.Curupira : CharacterId.SaciPerere,
                _ => i % 2 == 0 ? CharacterId.SaciPerere : CharacterId.Boitata, // espelhado: 3 Saci + 2 Boitatá em cada lado
            };
            sim.AddChampion((Team)t, id, $"b{t}{i}", true);
        }
    sim.Run(sim.Config.MaxDuration + 1f);
    wins[sim.Match.Winner == Team.None ? 2 : (int)sim.Match.Winner]++;
    totalTime += sim.Time;
    foreach (var c in sim.Champions)
    {
        dmg.TryGetValue(c.Character, out var v);
        dmg[c.Character] = (v.dmg + c.MatchStats.DamageDealt, 0, v.k + c.MatchStats.Kills, v.d + c.MatchStats.Deaths, v.count + 1);
    }
}
Console.WriteLine($"modo={mode} partidas={n} Aurora={wins[0]} Crepúsculo={wins[1]} empates={wins[2]} duração média={totalTime / n / 60:0.0} min");
foreach (var kv in dmg)
    Console.WriteLine($"  {kv.Key}: dano médio={kv.Value.dmg / kv.Value.count:0} abates={kv.Value.k / (double)kv.Value.count:0.0} mortes={kv.Value.d / (double)kv.Value.count:0.0}");
