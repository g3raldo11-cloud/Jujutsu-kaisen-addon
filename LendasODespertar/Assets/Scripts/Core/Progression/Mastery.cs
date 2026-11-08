using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    public sealed class MasteryChallenge
    {
        public string Id;
        public CharacterId Character;
        public string Name;
        public string Description;
        /// <summary>Contador de <see cref="MatchStats"/> que alimenta o desafio.</summary>
        public string Counter;
        public int Target;
        public int RewardXp;
    }

    public enum UnlockKind { Historia, EfeitoCosmetico, Animacao, Titulo }

    public sealed class MasteryUnlock
    {
        public CharacterId Character;
        public int Level;
        public UnlockKind Kind;
        public string Id;
        public string Name;
        public string Text;
    }

    /// <summary>Progresso de domínio de uma entidade. Apenas cosméticos e histórias — nunca poder.</summary>
    [Serializable]
    public sealed class CharacterMastery
    {
        public CharacterId Character;
        public int Xp;
        public int Matches;
        public int Wins;
        public Dictionary<string, int> ChallengeProgress = new Dictionary<string, int>();
        public List<string> CompletedChallenges = new List<string>();
    }

    public sealed class MatchResultSummary
    {
        public int XpGained;
        public int LevelBefore;
        public int LevelAfter;
        public readonly List<MasteryChallenge> ChallengesCompleted = new List<MasteryChallenge>();
        public readonly List<MasteryUnlock> Unlocked = new List<MasteryUnlock>();
    }

    /// <summary>Regras de domínio: XP por desempenho e objetivos (não só abates), níveis, desafios e desbloqueios.</summary>
    public static class MasteryRules
    {
        public static readonly int[] LevelThresholds = { 0, 300, 800, 1500, 2500, 4000, 6000 };
        public static int MaxLevel => LevelThresholds.Length;

        public static int LevelFor(int xp)
        {
            int level = 1;
            for (int i = 1; i < LevelThresholds.Length; i++) if (xp >= LevelThresholds[i]) level = i + 1;
            return level;
        }

        public static readonly MasteryChallenge[] Challenges =
        {
            new MasteryChallenge { Id = "saci_trocas", Character = CharacterId.SaciPerere, Name = "Quem é o verdadeiro?", Description = "Troque de lugar com a ilusão perto de inimigos 10 vezes.", Counter = "saci_trocas_arriscadas", Target = 10, RewardXp = 200 },
            new MasteryChallenge { Id = "saci_saltos", Character = CharacterId.SaciPerere, Name = "Dono dos Ventos", Description = "Salte entre redemoinhos 25 vezes no Reino dos Redemoinhos.", Counter = "saci_saltos", Target = 25, RewardXp = 250 },
            new MasteryChallenge { Id = "boitata_corpo", Character = CharacterId.Boitata, Name = "Muralha de Brasas", Description = "Queime inimigos com o próprio corpo 40 vezes.", Counter = "boitata_queimaduras_corpo", Target = 40, RewardXp = 200 },
            new MasteryChallenge { Id = "comum_ecos", Character = CharacterId.SaciPerere, Name = "Guardião da Memória (Saci)", Description = "Colete 60 Ecos Espirituais.", Counter = "ecos", Target = 60, RewardXp = 150 },
            new MasteryChallenge { Id = "comum_ecos_b", Character = CharacterId.Boitata, Name = "Guardião da Memória (Boitatá)", Description = "Colete 60 Ecos Espirituais.", Counter = "ecos", Target = 60, RewardXp = 150 },
        };

        public static readonly MasteryUnlock[] Unlocks =
        {
            new MasteryUnlock { Character = CharacterId.SaciPerere, Level = 2, Kind = UnlockKind.Historia, Id = "saci_hist_1", Name = "O Gomo do Bambu",
                Text = "Dizem que o Saci nasce dentro do gomo do bambu e lá fica sete anos. Quando o gomo estala, o vento ganha um dono travesso que vive setenta e sete anos." },
            new MasteryUnlock { Character = CharacterId.SaciPerere, Level = 3, Kind = UnlockKind.EfeitoCosmetico, Id = "saci_vfx_folhas", Name = "Redemoinho de Folhas Secas", Text = "O Redemoinho levanta folhas secas em vez de poeira." },
            new MasteryUnlock { Character = CharacterId.SaciPerere, Level = 4, Kind = UnlockKind.Animacao, Id = "saci_vitoria_cachimbo", Name = "Vitória: Baforada", Text = "Animação de vitória soprando anéis de fumaça do cachimbo." },
            new MasteryUnlock { Character = CharacterId.SaciPerere, Level = 5, Kind = UnlockKind.Historia, Id = "saci_hist_2", Name = "A Peneira e a Garrafa",
                Text = "Quem joga uma peneira no redemoinho pode prender o Saci numa garrafa. Mas a tradição avisa: Saci preso não perdoa, e o vento sempre encontra uma fresta." },
            new MasteryUnlock { Character = CharacterId.SaciPerere, Level = 7, Kind = UnlockKind.Titulo, Id = "saci_titulo", Name = "Título: Senhor dos Redemoinhos" },
            new MasteryUnlock { Character = CharacterId.Boitata, Level = 2, Kind = UnlockKind.Historia, Id = "boi_hist_1", Name = "Depois do Dilúvio",
                Text = "Nas narrativas do Sul, a grande cobra sobreviveu à noite sem fim do dilúvio comendo os olhos dos animais. A luz que engoliu nunca mais saiu: virou o Boitatá." },
            new MasteryUnlock { Character = CharacterId.Boitata, Level = 3, Kind = UnlockKind.EfeitoCosmetico, Id = "boi_vfx_azul", Name = "Fogo-Fátuo Azul", Text = "As chamas do corpo ganham o tom azulado do fogo-fátuo." },
            new MasteryUnlock { Character = CharacterId.Boitata, Level = 4, Kind = UnlockKind.Animacao, Id = "boi_entrada_espiral", Name = "Entrada: Espiral de Brasas", Text = "Animação de entrada enrolando-se em espiral." },
            new MasteryUnlock { Character = CharacterId.Boitata, Level = 5, Kind = UnlockKind.Historia, Id = "boi_hist_2", Name = "Guardião dos Campos",
                Text = "Quem põe fogo no campo por maldade encontra, na noite seguinte, uma luz que o segue sem pressa. Dizem que quem encara o Boitatá fica cego, louco ou morre." },
            new MasteryUnlock { Character = CharacterId.Boitata, Level = 7, Kind = UnlockKind.Titulo, Id = "boi_titulo", Name = "Título: Olho que Queima" },
        };

        public static int XpForMatch(MatchStats s, bool won, float matchMinutes)
        {
            float xp = 60f + matchMinutes * 10f;
            xp += s.Kills * 15f + s.Assists * 10f;
            xp += s.Ecos * 6f;
            xp += s.ObjectiveSeconds * 0.8f;
            xp += s.Synergies * 25f;
            xp += s.Healing * 0.05f;
            if (won) xp *= 1.3f;
            return (int)MathF.Round(MathF.Min(xp, 1200f));
        }

        public static MatchResultSummary Apply(CharacterMastery m, MatchStats stats, bool won, float matchMinutes)
        {
            var result = new MatchResultSummary { LevelBefore = LevelFor(m.Xp) };
            m.Matches++;
            if (won) m.Wins++;
            int xp = XpForMatch(stats, won, matchMinutes);

            foreach (var ch in Challenges)
            {
                if (ch.Character != m.Character || m.CompletedChallenges.Contains(ch.Id)) continue;
                int gained = ch.Counter == "ecos" ? stats.Ecos : stats.Get(ch.Counter);
                m.ChallengeProgress.TryGetValue(ch.Id, out int prog);
                prog += gained;
                m.ChallengeProgress[ch.Id] = prog;
                if (prog >= ch.Target)
                {
                    m.CompletedChallenges.Add(ch.Id);
                    xp += ch.RewardXp;
                    result.ChallengesCompleted.Add(ch);
                }
            }

            m.Xp += xp;
            result.XpGained = xp;
            result.LevelAfter = LevelFor(m.Xp);
            foreach (var u in Unlocks)
                if (u.Character == m.Character && u.Level > result.LevelBefore && u.Level <= result.LevelAfter) result.Unlocked.Add(u);
            return result;
        }

        public static IEnumerable<MasteryUnlock> UnlockedFor(CharacterMastery m)
        {
            int level = LevelFor(m.Xp);
            foreach (var u in Unlocks) if (u.Character == m.Character && u.Level <= level) yield return u;
        }
    }
}
