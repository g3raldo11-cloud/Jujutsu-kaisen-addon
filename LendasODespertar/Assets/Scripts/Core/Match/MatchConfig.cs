namespace Lendas.Core
{
    public enum GameMode { CicloDasLendas, Treinamento, Personalizado, Casual }

    /// <summary>Regras da partida. O modo personalizado altera esses valores.</summary>
    public sealed class MatchConfig
    {
        public GameMode Mode = GameMode.CicloDasLendas;
        public string MapId = MapFactory.FlorestaAmazonica;
        public uint Seed = 12345;
        public int TeamSize = 5;

        public float DespertarDuration = 75f;
        public float RessonanciaDuration = 150f;
        /// <summary>Tempo máximo total; ao fim, vence quem tiver mais Domínio, depois mais Memória.</summary>
        public float MaxDuration = 900f;

        public int MaxEchoesDespertar = 12;
        public int MaxEchoesLater = 6;
        public float EchoIntervalDespertar = 3.5f;
        public float EchoIntervalLater = 9f;
        public float EchoMemory = 4f;
        public float EchoEnergy = 15f;

        public float MarcoCaptureRate = 14f;
        public float MarcoMemoryPerSecond = 1.5f;

        public float HeartActivationCost = 100f;
        public float HeartChannelTime = 6f;
        public float HeartDisruptTime = 5f;
        public float HeartDominanceToWin = 60f;

        public float KillMemory = 5f;
        public float RespawnBase = 6f;
        public float RespawnPerMinute = 0.5f;
        public float RespawnMax = 14f;

        public bool EnvironmentEvents = true;
        public bool Synergies = true;

        /// <summary>Treinamento: recargas reduzidas e sem vitória automática.</summary>
        public bool InfiniteResources;
        public bool DisableVictory;

        /// <summary>Desliga Ecos, Marcos, Coração e eventos (arena vazia de teste).</summary>
        public bool ObjectivesEnabled = true;

        /// <summary>Arena vazia + boneco de teste: recursos infinitos, recargas rápidas, sem objetivos.</summary>
        public static MatchConfig TestArena() => new MatchConfig
        {
            Mode = GameMode.Treinamento,
            MapId = MapFactory.ArenaDeTeste,
            InfiniteResources = true,
            DisableVictory = true,
            ObjectivesEnabled = false,
            EnvironmentEvents = false,
            MaxDuration = float.MaxValue,
        };

        public static MatchConfig Training() => new MatchConfig
        {
            Mode = GameMode.Treinamento,
            InfiniteResources = true,
            DisableVictory = true,
            DespertarDuration = 20f,
            RessonanciaDuration = 40f,
            MaxDuration = 99999f,
        };
    }
}
