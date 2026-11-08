namespace Lendas.Core
{
    /// <summary>
    /// Lógica exclusiva de cada entidade (passiva, habilidades, mecânica própria e uso pelos bots).
    /// O núcleo de combate (recargas, energia, dano, controle) fica na <see cref="Simulation"/>;
    /// cada kit só descreve o que é único da lenda.
    /// </summary>
    public abstract class ChampionKit
    {
        public Champion Owner { get; private set; }
        protected Simulation Sim { get; private set; }

        public abstract CharacterId Id { get; }

        public void Bind(Simulation sim, Champion owner)
        {
            Sim = sim;
            Owner = owner;
            OnBind();
        }

        protected virtual void OnBind() { }

        /// <summary>Executa a habilidade. Recarga e custo só são aplicados se retornar true.</summary>
        public abstract bool Cast(AbilitySlot slot, Vec2 aimPoint);

        /// <summary>
        /// Reconjuração (ex.: trocar de posição antes do tempo, saltar entre redemoinhos).
        /// Chamado antes das checagens de recarga; retornar true consome o comando.
        /// </summary>
        public virtual bool TryRecast(AbilitySlot slot, Vec2 aimPoint) => false;

        public virtual void Tick(float dt) { }

        /// <summary>Chamado com a intenção de movimento do comando (já normalizada).</summary>
        public virtual void OnMoveInput(Vec2 direction, float dt) { }

        public virtual float SpeedMultiplier => 1f;
        public virtual float DamageMultiplier => 1f;
        public virtual float RadiusMultiplier => 1f;
        /// <summary>Multiplicador do dano recebido (passivas defensivas).</summary>
        public virtual float DamageTakenMultiplier => 1f;
        public virtual bool CanBasicAttack => true;
        public virtual bool IgnoresSlows => false;
        public virtual bool IsAquatic => false;

        public virtual void OnBasicHit(Unit target) { }
        public virtual void OnDeath() { }
        public virtual void OnRespawn() { }

        /// <summary>Indica se a habilidade está em estado de reconjuração (para a interface).</summary>
        public virtual bool IsRecastAvailable(AbilitySlot slot) => false;

        /// <summary>Decisões de habilidade específicas da entidade quando controlada por bot.</summary>
        public virtual void BotUseAbilities(BotContext ctx) { }

        /// <summary>Recurso exclusivo exibido na interface (ex.: Calor do Boitatá, cargas de Travessura).</summary>
        public virtual string ResourceName => null;
        public virtual float ResourceValue => 0f;
        public virtual float ResourceMax => 1f;
    }
}
