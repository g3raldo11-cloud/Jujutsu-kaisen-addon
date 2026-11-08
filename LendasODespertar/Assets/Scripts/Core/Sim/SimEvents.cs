using System;

namespace Lendas.Core
{
    [Flags]
    public enum CommandButtons
    {
        None = 0,
        Habilidade1 = 1 << 0,
        Habilidade2 = 1 << 1,
        Habilidade3 = 1 << 2,
        Suprema = 1 << 3,
        Esquiva = 1 << 4,
        Salto = 1 << 5,
    }

    /// <summary>
    /// Comando de um jogador para um tick. É a única coisa que o cliente envia ao servidor
    /// (arquitetura autoritativa): o servidor valida e simula; o cliente só apresenta.
    /// </summary>
    public struct PlayerCommand
    {
        /// <summary>Direção de movimento no mundo (comprimento ≤ 1).</summary>
        public Vec2 Move;
        /// <summary>Ponto mirado no chão.</summary>
        public Vec2 AimPoint;
        public bool Attack;
        public bool Sprint;
        public CommandButtons Pressed;

        public bool IsPressed(CommandButtons b) => (Pressed & b) != 0;

        public static CommandButtons ButtonFor(AbilitySlot slot)
        {
            switch (slot)
            {
                case AbilitySlot.Habilidade1: return CommandButtons.Habilidade1;
                case AbilitySlot.Habilidade2: return CommandButtons.Habilidade2;
                case AbilitySlot.Habilidade3: return CommandButtons.Habilidade3;
                case AbilitySlot.Suprema: return CommandButtons.Suprema;
                default: return CommandButtons.None;
            }
        }
    }

    public enum SimEventType
    {
        AbilityCast,
        AbilityRecast,
        BasicAttack,
        BasicMiss,
        Damage,
        Heal,
        Death,
        Respawn,
        Dodge,
        Jump,
        EchoSpawned,
        EchoCollected,
        MarcoCaptured,
        MarcoNeutralized,
        PhaseChanged,
        EnvironmentWarning,
        EnvironmentStarted,
        EnvironmentEnded,
        SynergyTriggered,
        HeartAwakened,
        HeartActivated,
        HeartDisrupted,
        Victory,
        DecoyBroken,
        Swap,
        Blink,
        SpiritSpawned,
        SpiritDefeated,
        Interrupted,
        ZoneExploded,
        ProjectileHit,
    }

    /// <summary>Evento emitido pela simulação para a apresentação (efeitos, sons, interface, rede).</summary>
    public struct SimEvent
    {
        public SimEventType Type;
        public int SourceId;
        public int TargetId;
        public Vec2 Position;
        public float Value;
        public int Slot;
        public Team Team;
        public string Text;

        public override string ToString() => $"{Type} src={SourceId} tgt={TargetId} v={Value:0.#} {Text}";
    }
}
