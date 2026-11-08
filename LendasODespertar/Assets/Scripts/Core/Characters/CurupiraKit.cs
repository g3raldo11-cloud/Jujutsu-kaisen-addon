using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>
    /// CURUPIRA — especialista em fogo, mobilidade e domínio de território.
    /// Guardião da mata com cabelos que parecem em combustão e pés voltados para trás: as pegadas
    /// que deixa apontam para o lado errado — e, aqui, explodem.
    /// Mecânica exclusiva — Domínio Térmico: os acertos acumulam Calor; o Calor aumenta o número de
    /// chamas, o raio do círculo, o dano das pegadas e da Suprema, e acima de 60 todas as habilidades
    /// incendeiam o alvo. Durante a Suprema, o Curupira controla a direção das labaredas pela mira.
    /// Curva de aprendizado: média-alta — exige manter o Calor alto (acertar sempre) e posicionar o fogo.
    /// </summary>
    public sealed class CurupiraKit : ChampionKit
    {
        public override CharacterId Id => CharacterId.Curupira;

        public const float MaxHeat = 100f;
        /// <summary>A partir deste Calor as habilidades recebem efeitos adicionais de fogo.</summary>
        public const float HotThreshold = 60f;
        /// <summary>Potência mínima de uma zona criada com Calor alto (ver <see cref="Power"/>).</summary>
        public const float HotPower = 1.3f;
        public float Heat { get; private set; }
        public bool IsHot => Heat >= HotThreshold;
        private float _sinceHeatGain = 999f;

        /// <summary>Potência térmica: 1,0 (frio) até 1,5 (Calor máximo).</summary>
        public float Power => 1f + 0.5f * (Heat / MaxHeat);

        // Chamas Invertidas (projéteis sinuosos).
        public sealed class Flame
        {
            public Vec2 Origin;
            public Vec2 Dir;
            public Vec2 Position;
            public float Traveled;
            public float Phase;
            public bool Alive = true;
            public bool Hot;
        }
        private readonly List<Flame> _flames = new List<Flame>();
        public IReadOnlyList<Flame> Flames => _flames;
        private int _flamesToFire;
        private float _flameTimer;
        private Vec2 _flameDir;
        private Vec2 _flameOrigin;
        public const float FlameSpeed = 15f;
        public const float FlameRange = 12f;

        // Passos Incandescentes.
        public bool IsDashing => _dashTime > 0f;
        private float _dashTime;
        private Vec2 _dashDir;
        private float _stepAcc;

        // Ira do Curupira.
        public bool WrathActive => _wrath != null && !_wrath.Expired;
        private Zone _wrath;
        private float _jetTimer;
        public Vec2 JetDirection { get; private set; }

        public static CharacterStats CreateStats()
        {
            var s = new CharacterStats
            {
                Id = CharacterId.Curupira,
                DisplayName = "Curupira",
                Role = "Fogo, mobilidade e domínio de território",
                Lore = "Guardião das matas nas narrativas de origem tupi, registrado desde as cartas de José de Anchieta (1560). " +
                       "Tem os pés voltados para trás, e quem segue suas pegadas anda para longe dele. Em muitas versões seus cabelos são " +
                       "vermelhos como fogo; aqui, eles realmente queimam. Castiga caçadores que matam por prazer e quem incendeia a floresta " +
                       "— e no Despertar, ninguém sabe dominar uma queimada como quem nasceu para proteger o mato dela.",
                PassiveName = "Combustão Natural",
                PassiveDescription = "Acertos acumulam Calor (ataque básico +12, habilidades +6 por alvo). Sem acertar por 3 s o Calor esfria. " +
                                     "Com Calor ≥ 60 todas as habilidades incendeiam o alvo e o Curupira fica 10% mais rápido.",
                Strengths = "Mobilidade alta, controle de território com fogo, dano crescente em lutas longas.",
                Weaknesses = "Começa frio: precisa acertar para ficar forte; o círculo de fogo protege uma área, não ele mesmo; projéteis podem ser esquivados.",
                MaxHp = 600f,
                MoveSpeed = 6.2f,
                Radius = 0.5f,
                VisionRadius = 12f,
                BasicDamage = 42f,
                BasicRange = 2.4f,
                BasicArcDeg = 90f,
                BasicInterval = 0.65f,
                EnergyRegen = 5.5f,
            };
            s.Abilities[0] = new AbilityDef { Slot = AbilitySlot.Basico, Name = "Golpe em Brasa", Description = "Golpe com o punho em brasa. Gera +12 de Calor por acerto.", Cooldown = 0.65f, Range = 2.4f, Indicator = IndicatorShape.Cone, ConeAngleDeg = 90f };
            s.Abilities[1] = new AbilityDef
            {
                Slot = AbilitySlot.Habilidade1, Name = "Chamas Invertidas", Cooldown = 7f, EnergyCost = 25f, Range = FlameRange, Area = 0.8f, Indicator = IndicatorShape.Linha,
                Description = "Dispara uma sequência de chamas em trajetória sinuosa (3 chamas; +1 a cada 33 de Calor). Cada chama causa 40 de dano ao primeiro alvo.",
            };
            s.Abilities[2] = new AbilityDef
            {
                Slot = AbilitySlot.Habilidade2, Name = "Passos Incandescentes", Cooldown = 9f, EnergyCost = 20f, Range = 7f, Area = 2f, Indicator = IndicatorShape.Linha,
                Description = "Avança 7 m deixando pegadas de fogo (viradas para trás) que explodem após 1,5 s: 50 de dano em 2 m, escalando com o Calor.",
            };
            s.Abilities[3] = new AbilityDef
            {
                Slot = AbilitySlot.Habilidade3, Name = "Fogo Guardião", Cooldown = 15f, EnergyCost = 35f, Range = 8f, Area = 4.5f, Indicator = IndicatorShape.AreaNoAlvo,
                Description = "Cria um círculo de chamas por 5 s (raio 4,5 m; até 6 m com Calor). Inimigos que cruzam a borda queimam e são empurrados para fora.",
            };
            s.Abilities[4] = new AbilityDef
            {
                Slot = AbilitySlot.Suprema, Name = "Ira do Curupira", Cooldown = 75f, Range = 0f, Area = 7f, Indicator = IndicatorShape.Circulo,
                Description = "Explosão de fogo sobrenatural (120 de dano em 7 m, até +50% com Calor). A região arde por 5 s e, a cada 0,5 s, uma labareda dispara na direção em que o Curupira mira (35 de dano).",
            };
            return s;
        }

        public override float SpeedMultiplier => IsHot ? 1.1f : 1f;
        public override bool CanBasicAttack => !IsDashing;
        public override string ResourceName => "Calor";
        public override float ResourceValue => Heat;
        public override float ResourceMax => MaxHeat;

        private void GainHeat(float amount)
        {
            Heat = MathF.Min(MaxHeat, Heat + amount);
            _sinceHeatGain = 0f;
        }

        /// <summary>Acerto de habilidade: Calor e, se quente, fogo adicional.</summary>
        private void AbilityHit(Unit u)
        {
            GainHeat(6f);
            if (IsHot) Sim.ApplyStatus(u, StatusType.Queimadura, 2f, 20f, Owner);
        }

        public override void OnBasicHit(Unit target)
        {
            GainHeat(12f);
            if (IsHot) Sim.ApplyStatus(target, StatusType.Queimadura, 1.5f, 15f, Owner);
        }

        public override bool Cast(AbilitySlot slot, Vec2 aimPoint)
        {
            Vec2 aimDir = (aimPoint - Owner.Position).Normalized;
            if (aimDir.SqrLength < 0.01f) aimDir = Owner.Facing;
            switch (slot)
            {
                case AbilitySlot.Habilidade1:
                    _flamesToFire = 3 + (int)(Heat / 33f);
                    _flameTimer = 0f;
                    _flameDir = aimDir;
                    _flameOrigin = Owner.Position;
                    return true;

                case AbilitySlot.Habilidade2:
                    _dashDir = aimDir;
                    _dashTime = 0.4f;
                    _stepAcc = 0.6f;
                    Owner.InvulnerableTime = MathF.Max(Owner.InvulnerableTime, 0.1f);
                    return true;

                case AbilitySlot.Habilidade3:
                {
                    Vec2 center = Owner.Position + (aimPoint - Owner.Position).ClampLength(8f);
                    float radius = 4.5f + 1.5f * (Heat / MaxHeat);
                    var z = Sim.AddZone(ZoneKind.CirculoDeFogo, Owner, center, radius, 5f);
                    z.Power = Power;
                    return true;
                }

                case AbilitySlot.Suprema:
                {
                    float dmg = 120f * Power;
                    Sim.ForEachEnemyInRadius(Owner.Position, 7f, Owner.Team, u =>
                    {
                        Sim.DealDamage(Owner, u, dmg);
                        Vec2 away = (u.Position - Owner.Position).Normalized;
                        u.Push(away * 10f, 0.3f);
                        AbilityHit(u);
                    });
                    _wrath = Sim.AddZone(ZoneKind.IraDoCurupira, Owner, Owner.Position, 9f, 5f);
                    _wrath.Power = Power;
                    _jetTimer = 0.3f;
                    JetDirection = Owner.Facing;
                    GainHeat(30f);
                    return true;
                }
            }
            return false;
        }

        public override void Tick(float dt)
        {
            // Combustão Natural: esfria se ficar 3 s sem acertar.
            _sinceHeatGain += dt;
            if (_sinceHeatGain > 3f) Heat = MathF.Max(0f, Heat - 10f * dt);

            // Dispara as chamas da sequência, uma a cada 0,12 s, a partir da posição atual.
            if (_flamesToFire > 0)
            {
                _flameTimer -= dt;
                if (_flameTimer <= 0f)
                {
                    _flameTimer = 0.12f;
                    int index = _flames.Count;
                    _flames.Add(new Flame { Origin = Owner.Position, Dir = _flameDir, Position = Owner.Position, Phase = (_flamesToFire % 2 == 0) ? 0f : MathF.PI, Hot = IsHot });
                    _flamesToFire--;
                }
            }
            TickFlames(dt);

            if (IsDashing)
            {
                _dashTime -= dt;
                Owner.ForcedVelocity = _dashDir * (7f / 0.4f);
                Owner.ForcedTime = dt * 1.01f;
                _stepAcc += 7f / 0.4f * dt;
                if (_stepAcc >= 1.2f)
                {
                    _stepAcc = 0f;
                    var z = Sim.AddZone(ZoneKind.PegadaIncandescente, Owner, Owner.Position, 2f, 1.5f);
                    z.Power = Power;
                }
            }

            if (WrathActive)
            {
                // Domínio Térmico: as labaredas seguem a mira do Curupira.
                JetDirection = Owner.Facing;
                _jetTimer -= dt;
                if (_jetTimer <= 0f)
                {
                    _jetTimer = 0.5f;
                    Vec2 a = _wrath.Position;
                    Vec2 b = a + JetDirection * _wrath.Radius;
                    Sim.ForEachEnemyInRadius(Vec2.Lerp(a, b, 0.5f), _wrath.Radius * 0.6f, Owner.Team, u =>
                    {
                        if (Vec2.DistanceToSegment(u.Position, a, b) > 1.5f + u.Radius) return;
                        Sim.DealDamage(Owner, u, 35f * _wrath.Power);
                        AbilityHit(u);
                    });
                    Sim.Emit(SimEventType.AbilityRecast, Owner.Id, 0, a, 0f, "Labareda", Owner.Team, (int)AbilitySlot.Suprema);
                }
            }
            else _wrath = null;
        }

        private void TickFlames(float dt)
        {
            for (int i = _flames.Count - 1; i >= 0; i--)
            {
                var f = _flames[i];
                if (!f.Alive) { _flames.RemoveAt(i); continue; }
                f.Traveled += FlameSpeed * dt;
                // Trajetória sinuosa sobre o eixo de disparo.
                float lateral = MathF.Sin(f.Traveled * 0.9f + f.Phase) * 1.4f;
                f.Position = f.Origin + f.Dir * f.Traveled + f.Dir.Perpendicular * lateral;
                if (f.Traveled >= FlameRange || Sim.Map.IsBlocked(f.Position, 0.1f)) { f.Alive = false; continue; }
                Unit hit = null;
                foreach (var u in Sim.HostileUnits(Owner.Team))
                    if (u.Targetable && Vec2.Distance(u.Position, f.Position) <= u.Radius + 0.5f) { hit = u; break; }
                if (hit == null) continue;
                Sim.DealDamage(Owner, hit, 40f);
                if (hit.Alive) AbilityHit(hit);
                Sim.Emit(SimEventType.ProjectileHit, Owner.Id, hit.Id, f.Position, 40f, null, Owner.Team);
                f.Alive = false;
            }
        }

        public override void OnDeath()
        {
            Heat = 0f;
            _flames.Clear();
            _flamesToFire = 0;
            _dashTime = 0f;
            _wrath = null;
        }

        public override void BotUseAbilities(BotContext ctx)
        {
            var target = ctx.Target;
            if (ctx.Retreating)
            {
                if (ctx.EnemiesNear > 0 && ctx.Ready(AbilitySlot.Habilidade2))
                    ctx.Use(AbilitySlot.Habilidade2, ctx.Sim.Map.BaseCenter[(int)Owner.Team]);
                return;
            }
            if (WrathActive && target != null) { ctx.MoveTowards(target.Position); return; }
            if (target == null) return;
            float dist = ctx.TargetDistance;
            if (ctx.Ready(AbilitySlot.Suprema) && target is Champion && dist < 5.5f && (ctx.EnemiesNear >= 2 || IsHot)) { ctx.Use(AbilitySlot.Suprema, target.Position); return; }
            if (ctx.Ready(AbilitySlot.Habilidade1) && dist < 10f && ctx.Chance(0.5f)) { ctx.Use(AbilitySlot.Habilidade1, target.Position); return; }
            if (ctx.Ready(AbilitySlot.Habilidade3) && dist < 7f && ctx.Chance(0.3f)) { ctx.Use(AbilitySlot.Habilidade3, ctx.Objective); return; }
            if (ctx.Ready(AbilitySlot.Habilidade2) && dist > 3f && dist < 8f && ctx.Chance(0.35f)) ctx.Use(AbilitySlot.Habilidade2, target.Position);
        }
    }
}
