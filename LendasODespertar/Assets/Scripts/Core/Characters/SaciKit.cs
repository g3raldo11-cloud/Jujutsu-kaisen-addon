using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>
    /// SACI-PERERÊ — mobilidade e confusão.
    /// Mecânica exclusiva: controle de trajetórias. Mudar de direção acumula Travessura (velocidade),
    /// o Redemoinho deixa âncoras no terreno e a Suprema permite saltar instantaneamente entre elas.
    /// Curva de aprendizado: alta — exige leitura de rotas e uso de ilusões para enganar.
    /// </summary>
    public sealed class SaciKit : ChampionKit
    {
        public override CharacterId Id => CharacterId.SaciPerere;

        // Travessura
        public const int MaxStacks = 4;
        public const float StackSpeed = 0.07f;
        public int TravessuraStacks { get; private set; }
        private float _stackTimer;
        private float _stackGate;
        private Vec2 _lastMoveDir;

        // Redemoinho
        public bool IsTornado => TornadoRemaining > 0f;
        public float TornadoRemaining { get; private set; }
        public bool TornadoFused { get; private set; }
        private readonly HashSet<int> _tornadoHits = new HashSet<int>();

        // Troca-Troca
        private int _decoyId = -1;
        private float _swapTimer;

        // Reino dos Redemoinhos
        private Zone _realm;
        private float _blinkCooldown;

        public static CharacterStats CreateStats()
        {
            var s = new CharacterStats
            {
                Id = CharacterId.SaciPerere,
                DisplayName = "Saci-Pererê",
                Role = "Mobilidade e confusão",
                Lore = "Nascido dos redemoinhos de vento que levantam a poeira das estradas de terra, o Saci é a travessura em pessoa: " +
                       "dá nó na crina dos cavalos, esconde objetos e some num piscar de olhos. Nas versões do interior paulista e mineiro " +
                       "ele vive dentro dos redemoinhos; em outras, nasce dos gomos do bambu. No Despertar, o Saci luta por diversão " +
                       "— e para que ninguém esqueça que o vento também tem dono.",
                PassiveName = "Travessura",
                PassiveDescription = "Cada mudança brusca de direção acumula Travessura (até 4): +7% de velocidade e 4% de redução de dano por acúmulo, por 2 s.",
                Strengths = "Mobilidade altíssima, difícil de prender, ótimo para roubar Ecos e Marcos distantes.",
                Weaknesses = "Pouca vida; sem as âncoras de redemoinho a Suprema perde força; controles sem alvo (raízes, zonas) o punem.",
                MaxHp = 580f,
                MoveSpeed = 6.4f,
                Radius = 0.45f,
                VisionRadius = 12f,
                BasicDamage = 44f,
                BasicRange = 2.2f,
                BasicArcDeg = 100f,
                BasicInterval = 0.55f,
                EnergyRegen = 6f,
            };
            s.Abilities[0] = new AbilityDef { Slot = AbilitySlot.Basico, Name = "Pulo-Chute", Description = "Chute giratório com a única perna.", Cooldown = 0.55f, Range = 2.2f, Indicator = IndicatorShape.Cone, ConeAngleDeg = 100f };
            s.Abilities[1] = new AbilityDef
            {
                Slot = AbilitySlot.Habilidade1, Name = "Redemoinho", Cooldown = 9f, EnergyCost = 25f, Range = 0f, Area = 1.2f, Indicator = IndicatorShape.Circulo,
                Description = "Vira um redemoinho por 1,8 s: +75% de velocidade, trajetória controlável, atravessa inimigos causando 70 de dano e empurrando-os. Deixa uma âncora de redemoinho no fim.",
            };
            s.Abilities[2] = new AbilityDef
            {
                Slot = AbilitySlot.Habilidade2, Name = "Troca-Troca", Cooldown = 12f, EnergyCost = 20f, Range = 9f, Indicator = IndicatorShape.Linha,
                Description = "Cria uma ilusão idêntica que corre na direção mirada. Após 1,4 s (ou ao reativar) o Saci troca de lugar com ela.",
            };
            s.Abilities[3] = new AbilityDef
            {
                Slot = AbilitySlot.Habilidade3, Name = "Vento Travesso", Cooldown = 10f, EnergyCost = 30f, Range = 9f, Indicator = IndicatorShape.Cone, ConeAngleDeg = 70f,
                Description = "Rajada em cone: 35 de dano, empurra 4 m e aplica Ventania (o movimento dos inimigos é arrastado pelo vento por 2 s).",
            };
            s.Abilities[4] = new AbilityDef
            {
                Slot = AbilitySlot.Suprema, Name = "Reino dos Redemoinhos", Cooldown = 70f, EnergyCost = 0f, Range = 8f, Area = 10f, Indicator = IndicatorShape.AreaNoAlvo,
                Description = "Área de vento intenso (10 m, 7 s) com 4 redemoinhos. Inimigos ficam 25% mais lentos. Reative para saltar instantaneamente ao redemoinho mais próximo da mira, causando 80 de dano ao chegar.",
            };
            return s;
        }

        public override float SpeedMultiplier => (1f + StackSpeed * TravessuraStacks) * (IsTornado ? 1.75f : 1f);
        public override bool CanBasicAttack => !IsTornado;
        public override bool IgnoresSlows => IsTornado;
        public override float DamageTakenMultiplier => 1f - 0.04f * TravessuraStacks;
        public override string ResourceName => "Travessura";
        public override float ResourceValue => TravessuraStacks;
        public override float ResourceMax => MaxStacks;

        public bool HasActiveDecoy => _decoyId >= 0;
        public bool RealmActive => _realm != null && !_realm.Expired;

        public override bool IsRecastAvailable(AbilitySlot slot) =>
            (slot == AbilitySlot.Habilidade2 && HasActiveDecoy) || (slot == AbilitySlot.Suprema && RealmActive);

        public override void OnMoveInput(Vec2 direction, float dt)
        {
            if (direction.SqrLength < 0.25f) return;
            Vec2 dir = direction.Normalized;
            if (_lastMoveDir.SqrLength > 0.25f && _stackGate <= 0f && Vec2.AngleBetween(_lastMoveDir, dir) > 50f * MathUtil.Deg2Rad)
            {
                TravessuraStacks = Math.Min(MaxStacks, TravessuraStacks + 1);
                _stackTimer = 2f;
                _stackGate = 0.25f;
            }
            _lastMoveDir = dir;
        }

        public override void Tick(float dt)
        {
            if (_stackGate > 0f) _stackGate -= dt;
            if (_stackTimer > 0f) { _stackTimer -= dt; if (_stackTimer <= 0f) TravessuraStacks = 0; }
            if (_blinkCooldown > 0f) _blinkCooldown -= dt;

            if (IsTornado)
            {
                TornadoRemaining -= dt;
                Sim.ForEachEnemyInRadius(Owner.Position, Owner.Radius + 1.2f, Owner.Team, u =>
                {
                    if (!_tornadoHits.Add(u.Id)) return;
                    Sim.DealDamage(Owner, u, 70f);
                    Vec2 side = (u.Position - Owner.Position).Normalized;
                    if (side.SqrLength < 0.01f) side = Owner.Facing.Perpendicular;
                    u.Push(side * 9f, 0.25f);
                });
                if (TornadoRemaining <= 0f)
                {
                    TornadoRemaining = 0f;
                    // Âncora de redemoinho: usada pela Suprema.
                    Sim.AddZone(ZoneKind.RedemoinhoAncora, Owner, Owner.Position, 1f, 12f);
                }
            }

            if (_decoyId >= 0)
            {
                _swapTimer -= dt;
                var decoy = Sim.FindUnit(_decoyId) as Decoy;
                if (decoy == null || !decoy.Alive) _decoyId = -1;
                else if (_swapTimer <= 0f) Swap(decoy);
            }

            if (_realm != null && _realm.Expired) _realm = null;
        }

        public override bool TryRecast(AbilitySlot slot, Vec2 aimPoint)
        {
            if (slot == AbilitySlot.Habilidade2 && _decoyId >= 0)
            {
                var decoy = Sim.FindUnit(_decoyId) as Decoy;
                // Troca antecipada só após 0,3 s, para evitar trocas instantâneas abusivas.
                if (decoy != null && decoy.Alive && _swapTimer <= 1.1f) { Swap(decoy); return true; }
                return false;
            }
            if (slot == AbilitySlot.Suprema && RealmActive)
            {
                if (_blinkCooldown > 0f) return false;
                Zone best = null;
                float bestDist = float.MaxValue;
                foreach (var z in Sim.Zones)
                {
                    if (z.OwnerId != Owner.Id || z.Kind != ZoneKind.RedemoinhoAncora) continue;
                    if (Vec2.Distance(z.Position, _realm.Position) > _realm.Radius + 0.5f) continue;
                    if (Vec2.Distance(z.Position, Owner.Position) < 1.5f) continue;
                    float d = Vec2.Distance(z.Position, aimPoint);
                    if (d < bestDist) { bestDist = d; best = z; }
                }
                if (best == null) return false;
                Vec2 from = Owner.Position;
                Owner.Position = Sim.ResolveObstacles(best.Position, Owner.Radius);
                _blinkCooldown = 0.6f;
                Sim.ForEachEnemyInRadius(Owner.Position, 3f, Owner.Team, u => Sim.DealDamage(Owner, u, 80f));
                Owner.MatchStats.Count("saci_saltos");
                Sim.Emit(SimEventType.Blink, Owner.Id, 0, Owner.Position, 0f, null, Owner.Team);
                Sim.Emit(SimEventType.AbilityRecast, Owner.Id, 0, from, 0f, "Salto entre Redemoinhos", Owner.Team, (int)AbilitySlot.Suprema);
                return true;
            }
            return false;
        }

        public override bool Cast(AbilitySlot slot, Vec2 aimPoint)
        {
            Vec2 aimDir = (aimPoint - Owner.Position).Normalized;
            if (aimDir.SqrLength < 0.01f) aimDir = Owner.Facing;
            switch (slot)
            {
                case AbilitySlot.Habilidade1:
                    TornadoRemaining = 1.8f;
                    TornadoFused = false;
                    _tornadoHits.Clear();
                    return true;

                case AbilitySlot.Habilidade2:
                {
                    if (_decoyId >= 0) return false;
                    var decoy = Sim.AddDecoy(Owner, Owner.Position, aimDir, Sim.CurrentSpeed(Owner), 2.2f);
                    _decoyId = decoy.Id;
                    _swapTimer = 1.4f;
                    return true;
                }

                case AbilitySlot.Habilidade3:
                {
                    var hit = Sim.ConeQuery(Owner.Position, aimDir, 9f, 70f, Owner.Team);
                    foreach (var u in hit)
                    {
                        Sim.DealDamage(Owner, u, 35f);
                        if (!u.Alive) continue;
                        u.Push(aimDir * 13f, 0.3f);
                        Sim.ApplyStatus(u, StatusType.Ventania, 2f, 3.2f, Owner, aimDir);
                    }
                    Sim.Synergy.TryBrasaAoVento(Owner, Owner.Position, aimDir, 9f, hit);
                    return true;
                }

                case AbilitySlot.Suprema:
                {
                    Vec2 center = Owner.Position + (aimPoint - Owner.Position).ClampLength(8f);
                    center = Sim.ResolveObstacles(center, 0.5f);
                    _realm = Sim.AddZone(ZoneKind.ReinoDosRedemoinhos, Owner, center, 10f, 7f);
                    for (int i = 0; i < 4; i++)
                    {
                        Vec2 p = Sim.ResolveObstacles(center + Vec2.FromAngle(i * MathF.PI * 0.5f + 0.4f) * 6f, 0.5f);
                        Sim.AddZone(ZoneKind.RedemoinhoAncora, Owner, p, 1f, 7f);
                    }
                    Sim.AddZone(ZoneKind.RedemoinhoAncora, Owner, center, 1f, 7f);
                    _blinkCooldown = 0.2f;
                    return true;
                }
            }
            return false;
        }

        private void Swap(Decoy decoy)
        {
            Vec2 a = Owner.Position;
            Owner.Position = Sim.ResolveObstacles(decoy.Position, Owner.Radius);
            decoy.Position = a;
            decoy.Lifetime = MathF.Min(decoy.Lifetime, 0.8f);
            _decoyId = -1;
            // Desafio de domínio: trocar de lugar perto de inimigos.
            foreach (var u in Sim.HostileUnits(Owner.Team))
                if (u is Champion && Vec2.Distance(u.Position, Owner.Position) < 6f) { Owner.MatchStats.Count("saci_trocas_arriscadas"); break; }
            Sim.Emit(SimEventType.Swap, Owner.Id, decoy.Id, Owner.Position, 0f, null, Owner.Team);
        }

        /// <summary>Chamado pela Ressonância Tempestade de Brasas.</summary>
        public void FuseTornado()
        {
            TornadoFused = true;
        }

        public override void OnDeath()
        {
            TornadoRemaining = 0f;
            TravessuraStacks = 0;
            _decoyId = -1;
            _realm = null;
        }

        public override void BotUseAbilities(BotContext ctx)
        {
            var target = ctx.Target;
            // Fuga: ilusão para trás e troca; ou redemoinho para longe.
            if (ctx.Retreating && ctx.EnemiesNear > 0)
            {
                Vec2 home = ctx.Sim.Map.BaseCenter[(int)Owner.Team];
                if (ctx.Ready(AbilitySlot.Habilidade2)) { ctx.Use(AbilitySlot.Habilidade2, home); return; }
                if (ctx.Ready(AbilitySlot.Habilidade1)) { ctx.Use(AbilitySlot.Habilidade1, home); return; }
                return;
            }
            if (HasActiveDecoy && ctx.Self.HpFraction < 0.5f) { ctx.Use(AbilitySlot.Habilidade2, Owner.Position); return; }
            if (RealmActive && target != null && Vec2.Distance(target.Position, Owner.Position) > 3f)
            {
                ctx.Use(AbilitySlot.Suprema, target.Position);
                return;
            }
            if (target == null) return;
            float dist = ctx.TargetDistance;
            if (target is Champion && ctx.Ready(AbilitySlot.Suprema) && (ctx.EnemiesNear >= 2 || target.HpFraction < 0.5f) && dist < 9f)
            {
                ctx.Use(AbilitySlot.Suprema, target.Position);
                return;
            }
            if (ctx.Ready(AbilitySlot.Habilidade3) && dist < 7f && ctx.Chance(0.4f)) { ctx.Use(AbilitySlot.Habilidade3, target.Position); return; }
            if (ctx.Ready(AbilitySlot.Habilidade1) && dist < 6f && ctx.Chance(0.35f)) { ctx.Use(AbilitySlot.Habilidade1, target.Position); return; }
            if (ctx.Ready(AbilitySlot.Habilidade2) && dist < 8f && ctx.Self.TimeSinceDamaged < 0.5f && ctx.Chance(0.3f))
            {
                // Ilusão corre para o lado; o Saci some na troca.
                Vec2 side = (target.Position - Owner.Position).Perpendicular.Normalized * 6f;
                ctx.Use(AbilitySlot.Habilidade2, Owner.Position + side);
            }
            if (IsTornado) ctx.MoveTowards(target.Position);
        }
    }
}
