namespace Lendas.Core
{
    public sealed class AbilityDef
    {
        public AbilitySlot Slot;
        public string Name;
        public string Description;
        public float Cooldown;
        public float EnergyCost;
        public float Range;
        /// <summary>Raio de área ou meia-largura (para indicadores de alcance).</summary>
        public float Area;
        public IndicatorShape Indicator;
        public float ConeAngleDeg;
    }

    public enum IndicatorShape { Nenhum, Circulo, Cone, Linha, AreaNoAlvo }

    /// <summary>Atributos-base de uma entidade. Na Unity podem ser sobrescritos por ScriptableObjects.</summary>
    public sealed class CharacterStats
    {
        public CharacterId Id;
        public string DisplayName;
        public string Role;
        public string Lore;
        public string PassiveName;
        public string PassiveDescription;
        public string Strengths;
        public string Weaknesses;
        public float MaxHp = 550f;
        public float MoveSpeed = 6f;
        public float Radius = 0.5f;
        public float VisionRadius = 12f;
        public float BasicDamage = 40f;
        public float BasicRange = 2.2f;
        public float BasicArcDeg = 90f;
        public float BasicInterval = 0.7f;
        public float EnergyRegen = 5f;
        public AbilityDef[] Abilities = new AbilityDef[5];

        public AbilityDef Ability(AbilitySlot slot) => Abilities[(int)slot];
    }
}
