using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>Qualquer coisa que ocupa espaço, tem vida e pode ser alvo.</summary>
    public abstract class Unit
    {
        public int Id;
        public Team Team;
        public Vec2 Position;
        public Vec2 Velocity;
        public Vec2 Facing = Vec2.Right;
        public float Radius = 0.5f;
        public float Hp;
        public float MaxHp;
        public bool Alive = true;
        public readonly StatusContainer Status = new StatusContainer();

        /// <summary>Deslocamento forçado (investidas, empurrões, correntezas).</summary>
        public Vec2 ForcedVelocity;
        public float ForcedTime;
        public float InvulnerableTime;
        /// <summary>No ar (salto): ignora zonas no chão.</summary>
        public float AirborneTime;

        public bool Targetable => Alive && InvulnerableTime <= 0f;
        public bool Airborne => AirborneTime > 0f;
        public float HpFraction => MaxHp > 0f ? Hp / MaxHp : 0f;

        public void Push(Vec2 velocity, float duration)
        {
            if (Status.Has(StatusType.Imparavel)) return;
            ForcedVelocity = velocity;
            ForcedTime = duration;
        }
    }

    public sealed class MatchStats
    {
        public int Kills, Deaths, Assists;
        public float DamageDealt, DamageTaken, Healing;
        public int Ecos;
        public float ObjectiveSeconds;
        public int Synergies;
        public readonly Dictionary<string, int> Counters = new Dictionary<string, int>();

        public void Count(string key, int amount = 1)
        {
            Counters.TryGetValue(key, out int v);
            Counters[key] = v + amount;
        }

        public int Get(string key) => Counters.TryGetValue(key, out int v) ? v : 0;
    }

    /// <summary>Entidade jogável (controlada por humano ou bot).</summary>
    public sealed class Champion : Unit
    {
        public string PlayerName;
        public CharacterId Character;
        public CharacterStats Stats;
        public ChampionKit Kit;
        public bool IsBot;

        public float Energy;
        public float MaxEnergy = 100f;
        public float UltCharge;
        public readonly float[] Cooldowns = new float[5];
        public float DodgeCooldown;
        public float JumpCooldown;
        public float Stamina = 100f;
        public bool Sprinting;
        public float RespawnTimer;
        /// <summary>Tempo de conjuração restante: impede outras ações.</summary>
        public float CastLock;
        public float TimeSinceDamaged = 999f;
        public float TimeSinceAttack = 999f;
        public readonly MatchStats MatchStats = new MatchStats();
        /// <summary>Quem causou dano recentemente (para assistências): id → tempo da simulação.</summary>
        public readonly Dictionary<int, float> RecentAttackers = new Dictionary<int, float>();

        public bool InCombat => TimeSinceDamaged < 3f || TimeSinceAttack < 3f;
        public bool CanAct => Alive && CastLock <= 0f && !Status.Has(StatusType.Atordoado);
        public bool CanMove => Alive && !Status.Has(StatusType.Atordoado) && !Status.Has(StatusType.Enraizado);
    }

    /// <summary>Ilusão (Troca-Troca do Saci). Para o inimigo é indistinguível do original.</summary>
    public sealed class Decoy : Unit
    {
        public int OwnerId;
        public CharacterId Character;
        public float Lifetime;
        public float Speed;
    }

    /// <summary>Assombração neutra que surge em eventos do mapa; derrotá-la libera Ecos.</summary>
    public sealed class NeutralSpirit : Unit
    {
        public Vec2 Home;
        public int TargetId = -1;
        public float AttackCooldown;
        public float LeashRadius = 9f;
        public float Damage = 22f;
        public float Speed = 3.6f;
        public int LastHitterId = -1;
    }

    /// <summary>Área com efeito contínuo (rastros de fogo, reinos, âncoras de redemoinho).</summary>
    public sealed class Zone
    {
        public int Id;
        public ZoneKind Kind;
        public int OwnerId;
        public Team Team;
        public Vec2 Position;
        public float Radius;
        public float Remaining;
        public float Duration;
        public float TickTimer;
        /// <summary>Se ≥ 0 a zona acompanha esta unidade.</summary>
        public int FollowId = -1;
        public bool Expired => Remaining <= 0f;
    }

    /// <summary>Eco Espiritual coletável.</summary>
    public sealed class EchoPickup
    {
        public int Id;
        public Vec2 Position;
        public float Value = 1f;
        public int SpawnIndex = -1;
    }
}
