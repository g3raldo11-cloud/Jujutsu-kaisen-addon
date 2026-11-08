using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>
    /// BOITATÁ — serpente de fogo protetora dos campos; dano em área e controle.
    /// Mecânica exclusiva: corpo segmentado. Cada segmento ocupa sua própria posição no cenário,
    /// bloqueia inimigos e, com Calor alto, queima quem encosta. Gerenciar o Calor (movimento) é central.
    /// Curva de aprendizado: média — exige posicionamento do corpo e manter-se em movimento.
    /// </summary>
    public sealed class BoitataKit : ChampionKit
    {
        public override CharacterId Id => CharacterId.Boitata;

        public const float MaxHeat = 100f;
        public const float BurningBodyHeat = 60f;
        public float Heat { get; private set; }

        // Corpo segmentado.
        public const int BaseSegments = 7;
        public const int GiantSegments = 12;
        public const float SegmentSpacing = 0.9f;
        public const float SegmentRadius = 0.55f;
        private readonly List<Vec2> _trail = new List<Vec2>();
        private readonly List<Vec2> _segments = new List<Vec2>();
        public IReadOnlyList<Vec2> Segments => _segments;

        // Investida Flamejante.
        public bool IsCharging => _chargeTime > 0f;
        private float _chargeTime;
        private float _chargeElapsed;
        private Vec2 _chargeDir;
        private readonly HashSet<int> _chargeHits = new HashSet<int>();

        // Rastro de Fogo.
        public bool TrailActive => _trailTime > 0f;
        private float _trailTime;
        private float _trailDrop;

        // Suprema.
        public bool GiantForm => _giantTime > 0f;
        private float _giantTime;
        private float _waveTimer;

        public static CharacterStats CreateStats()
        {
            var s = new CharacterStats
            {
                Id = CharacterId.Boitata,
                DisplayName = "Boitatá",
                Role = "Dano em área e controle",
                Lore = "Mbaê-tatá, \"coisa de fogo\" em tupi: a serpente luminosa que, segundo relatos registrados desde o século XVI, " +
                       "protege os campos e as matas de quem os incendeia. No Sul, conta-se que sobreviveu a um grande dilúvio comendo os " +
                       "olhos dos animais mortos e por isso ficou feita de luz; em outras regiões é o fogo-fátuo que persegue quem destrói a mata. " +
                       "No Despertar, o Boitatá vigia os Núcleos de Memória como vigiou os campos: com olhos que queimam.",
                PassiveName = "Chama Vigilante",
                PassiveDescription = "Mover-se gera Calor (até 100); ficar parado o dissipa. Calor aumenta o dano em até 20%. Acima de 60, o corpo inteiro queima quem encosta.",
                Strengths = "Controle de área enorme, corpo que bloqueia rotas, dano constante em lutas longas.",
                Weaknesses = "Alvo grande e lento para girar; parado perde força; Ofuscar não funciona em quem esquiva no tempo certo.",
                MaxHp = 640f,
                MoveSpeed = 5.6f,
                Radius = 0.8f,
                VisionRadius = 12f,
                BasicDamage = 46f,
                BasicRange = 2.8f,
                BasicArcDeg = 80f,
                BasicInterval = 0.85f,
                EnergyRegen = 5f,
            };
            s.Abilities[0] = new AbilityDef { Slot = AbilitySlot.Basico, Name = "Bote Incandescente", Description = "Bote rápido com presas de brasa.", Cooldown = 0.85f, Range = 2.8f, Indicator = IndicatorShape.Cone, ConeAngleDeg = 80f };
            s.Abilities[1] = new AbilityDef
            {
                Slot = AbilitySlot.Habilidade1, Name = "Investida Flamejante", Cooldown = 8f, EnergyCost = 25f, Range = 9f, Area = 1.6f, Indicator = IndicatorShape.Linha,
                Description = "Avança 9 m em linha serpenteante. Inimigos atingidos sofrem 70 de dano (amplificado pelo Calor) e são arremessados. +20 de Calor.",
            };
            s.Abilities[2] = new AbilityDef
            {
                Slot = AbilitySlot.Habilidade2, Name = "Olhar Incandescente", Cooldown = 13f, EnergyCost = 30f, Range = 8f, Indicator = IndicatorShape.Cone, ConeAngleDeg = 60f,
                Description = "Onda de luz em cone: 25 de dano, Ofusca por 2,2 s (visão reduzida a 3 m e ataques básicos falham) e 30% de lentidão por 1,2 s. Com Calor ≥ 60 o Ofuscamento dura +0,8 s.",
            };
            s.Abilities[3] = new AbilityDef
            {
                Slot = AbilitySlot.Habilidade3, Name = "Rastro de Fogo", Cooldown = 14f, EnergyCost = 30f, Range = 0f, Area = 1.3f, Indicator = IndicatorShape.Nenhum,
                Description = "Por 4 s, a cauda deixa uma trilha de fogo (24 de dano por segundo, 3,5 s). +15% de velocidade. Quem está no ar não é atingido.",
            };
            s.Abilities[4] = new AbilityDef
            {
                Slot = AbilitySlot.Suprema, Name = "Serpente do Incêndio Celestial", Cooldown = 80f, Range = 0f, Area = 5f, Indicator = IndicatorShape.Circulo,
                Description = "Por 6 s assume a forma gigante: corpo 50% maior e mais longo, +35% de velocidade, Imparável, Calor máximo e uma onda de fogo a cada 0,8 s (42 de dano, 5 m).",
            };
            return s;
        }

        public override float SpeedMultiplier => (GiantForm ? 1.35f : 1f) * (TrailActive ? 1.15f : 1f);
        public override float DamageMultiplier => 1f + 0.2f * (Heat / MaxHeat);
        public override float RadiusMultiplier => GiantForm ? 1.5f : 1f;
        public override bool CanBasicAttack => !IsCharging;
        public override string ResourceName => "Calor";
        public override float ResourceValue => Heat;
        public override float ResourceMax => MaxHeat;

        protected override void OnBind() => ResetBody();

        private void ResetBody()
        {
            _trail.Clear();
            _segments.Clear();
            _trail.Add(Owner.Position);
            int count = GiantForm ? GiantSegments : BaseSegments;
            for (int i = 0; i < count; i++) _segments.Add(Owner.Position - Owner.Facing * SegmentSpacing * (i + 1));
        }

        public override bool Cast(AbilitySlot slot, Vec2 aimPoint)
        {
            Vec2 aimDir = (aimPoint - Owner.Position).Normalized;
            if (aimDir.SqrLength < 0.01f) aimDir = Owner.Facing;
            switch (slot)
            {
                case AbilitySlot.Habilidade1:
                    _chargeDir = aimDir;
                    _chargeTime = 0.55f;
                    _chargeElapsed = 0f;
                    _chargeHits.Clear();
                    Heat = MathF.Min(MaxHeat, Heat + 20f);
                    return true;

                case AbilitySlot.Habilidade2:
                {
                    float blind = Heat >= BurningBodyHeat ? 3f : 2.2f;
                    foreach (var u in Sim.ConeQuery(Owner.Position, aimDir, 8f, 60f, Owner.Team))
                    {
                        Sim.DealDamage(Owner, u, 25f * DamageMultiplier);
                        Sim.ApplyStatus(u, StatusType.Ofuscado, blind, 1f, Owner);
                        Sim.ApplyStatus(u, StatusType.Lentidao, 1.2f, 0.3f, Owner);
                    }
                    return true;
                }

                case AbilitySlot.Habilidade3:
                    _trailTime = 4f;
                    _trailDrop = 0f;
                    return true;

                case AbilitySlot.Suprema:
                    _giantTime = 6f;
                    _waveTimer = 0.4f;
                    Heat = MaxHeat;
                    Sim.ApplyStatus(Owner, StatusType.Imparavel, 6f, 1f, Owner);
                    Owner.Status.Remove(StatusType.Lentidao);
                    Owner.Status.Remove(StatusType.Enraizado);
                    Owner.Status.Remove(StatusType.Ventania);
                    return true;
            }
            return false;
        }

        public override void Tick(float dt)
        {
            // Calor: cresce em movimento, dissipa parado.
            bool moving = Owner.Velocity.SqrLength > 1f || Owner.ForcedTime > 0f;
            if (GiantForm) Heat = MaxHeat;
            else Heat = MathUtil.Clamp(Heat + (moving ? 14f : -22f) * dt, 0f, MaxHeat);

            if (IsCharging)
            {
                _chargeElapsed += dt;
                _chargeTime -= dt;
                // Linha serpenteante: oscilação lateral sobre a direção da investida.
                Vec2 lateral = _chargeDir.Perpendicular * (MathF.Cos(_chargeElapsed * 18f) * 6f);
                Owner.ForcedVelocity = _chargeDir * (9f / 0.55f) + lateral;
                Owner.ForcedTime = dt * 1.01f;
                Sim.ForEachEnemyInRadius(Owner.Position, 1.6f * RadiusMultiplier, Owner.Team, u =>
                {
                    if (!_chargeHits.Add(u.Id)) return;
                    Sim.DealDamage(Owner, u, 70f * DamageMultiplier);
                    u.Push((_chargeDir + (u.Position - Owner.Position).Normalized).Normalized * 10f, 0.25f);
                });
            }

            if (TrailActive)
            {
                _trailTime -= dt;
                _trailDrop -= dt;
                if (_trailDrop <= 0f)
                {
                    _trailDrop = 0.35f;
                    Vec2 tail = _segments.Count > 0 ? _segments[_segments.Count - 1] : Owner.Position;
                    Sim.AddZone(ZoneKind.RastroDeFogo, Owner, tail, 1.3f, 3.5f);
                }
            }

            if (GiantForm)
            {
                _giantTime -= dt;
                _waveTimer -= dt;
                if (_waveTimer <= 0f)
                {
                    _waveTimer = 0.8f;
                    Sim.ForEachEnemyInRadius(Owner.Position, 5f, Owner.Team, u =>
                    {
                        Sim.DealDamage(Owner, u, 42f);
                        Sim.ApplyStatus(u, StatusType.Lentidao, 1f, 0.2f, Owner);
                    });
                }
            }

            UpdateBody();
            BodyCollision(dt);
        }

        /// <summary>Os segmentos seguem o caminho percorrido pela cabeça.</summary>
        private void UpdateBody()
        {
            if (_trail.Count == 0 || Vec2.Distance(_trail[0], Owner.Position) > 0.15f) _trail.Insert(0, Owner.Position);
            int count = GiantForm ? GiantSegments : BaseSegments;
            float spacing = SegmentSpacing * RadiusMultiplier;
            while (_segments.Count < count) _segments.Add(_segments.Count > 0 ? _segments[_segments.Count - 1] : Owner.Position);
            while (_segments.Count > count) _segments.RemoveAt(_segments.Count - 1);

            float needed = spacing;
            int seg = 0;
            float acc = 0f;
            Vec2 prev = Owner.Position;
            for (int i = 0; i < _trail.Count && seg < count; i++)
            {
                Vec2 p = _trail[i];
                float d = Vec2.Distance(prev, p);
                while (d > 0f && acc + d >= needed && seg < count)
                {
                    float t = (needed - acc) / d;
                    Vec2 point = Vec2.Lerp(prev, p, t);
                    _segments[seg++] = point;
                    d -= (needed - acc);
                    prev = point;
                    acc = 0f;
                    needed = spacing;
                }
                acc += d;
                prev = p;
            }
            // Cauda recolhida se o rastro ainda é curto (início da partida, renascimento).
            for (; seg < count; seg++) _segments[seg] = seg > 0 ? _segments[seg - 1] : Owner.Position;

            // Poda o histórico além do comprimento do corpo.
            float maxLen = spacing * (count + 2);
            float total = 0f;
            for (int i = 1; i < _trail.Count; i++)
            {
                total += Vec2.Distance(_trail[i - 1], _trail[i]);
                if (total > maxLen) { if (i + 1 < _trail.Count) _trail.RemoveRange(i + 1, _trail.Count - i - 1); break; }
            }
        }

        /// <summary>Colisão segmentada: o corpo empurra inimigos e, quente, os queima.</summary>
        private void BodyCollision(float dt)
        {
            float segR = SegmentRadius * RadiusMultiplier;
            bool burning = Heat >= BurningBodyHeat;
            foreach (var c in Sim.Champions)
            {
                if (!c.Alive || c.Team == Owner.Team || c.Airborne) continue;
                // O redemoinho do Saci passa por cima do corpo.
                if (c.Kit is SaciKit sk && sk.IsTornado) continue;
                float cr = c.Radius * c.Kit.RadiusMultiplier;
                bool touched = false;
                // Duas passadas por todos os segmentos: sair de um segmento não pode empurrar para dentro do vizinho.
                for (int pass = 0; pass < 2; pass++)
                    for (int i = 0; i < _segments.Count; i++)
                    {
                        Vec2 d = c.Position - _segments[i];
                        float dist = d.Length;
                        float min = segR + cr;
                        if (dist >= min) continue;
                        Vec2 n = dist > 1e-4f ? d / dist : Owner.Facing.Perpendicular;
                        // Empurra para o lado do corpo (perpendicular ao segmento) para não "deslizar" ao longo dele.
                        Vec2 along = i > 0 ? (_segments[i - 1] - _segments[i]).Normalized : Owner.Facing;
                        Vec2 side = n - along * Vec2.Dot(n, along);
                        if (side.SqrLength > 0.01f) n = side.Normalized;
                        else n = along.Perpendicular;
                        float sideDist = Vec2.Dot(c.Position - _segments[i], n);
                        c.Position = Sim.ResolveObstacles(c.Position + n * (min - sideDist), cr);
                        touched = true;
                    }
                if (touched && burning && Sim.ApplyStatus(c, StatusType.Queimadura, 1f, 12f, Owner))
                {
                    if (!c.Status.Has(StatusType.Imparavel)) Owner.MatchStats.Count("boitata_queimaduras_corpo");
                }
            }
        }

        public override void OnDeath()
        {
            Heat = 0f;
            _chargeTime = 0f;
            _trailTime = 0f;
            _giantTime = 0f;
        }

        public override void OnRespawn() => ResetBody();

        public override void BotUseAbilities(BotContext ctx)
        {
            var target = ctx.Target;
            if (ctx.Retreating)
            {
                if (ctx.EnemiesNear > 0 && ctx.Ready(AbilitySlot.Habilidade3)) ctx.Use(AbilitySlot.Habilidade3, Owner.Position);
                return;
            }
            if (target == null) return;
            float dist = ctx.TargetDistance;
            if (ctx.Ready(AbilitySlot.Suprema) && target is Champion && (ctx.EnemiesNear >= 2 || dist < 4f) && ctx.Self.HpFraction > 0.35f)
            {
                ctx.Use(AbilitySlot.Suprema, target.Position);
                return;
            }
            if (ctx.Ready(AbilitySlot.Habilidade2) && dist < 7f && ctx.Chance(0.5f)) { ctx.Use(AbilitySlot.Habilidade2, target.Position); return; }
            if (ctx.Ready(AbilitySlot.Habilidade1) && dist > 3f && dist < 8.5f && ctx.Chance(0.4f)) { ctx.Use(AbilitySlot.Habilidade1, target.Position); return; }
            if (ctx.Ready(AbilitySlot.Habilidade3) && dist < 6f && ctx.Chance(0.3f)) ctx.Use(AbilitySlot.Habilidade3, target.Position);
            // Mantém-se em movimento circulando o alvo para não perder Calor.
            if (dist < 2.5f) ctx.Strafe(target.Position, 0.6f);
        }
    }
}
