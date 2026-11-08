using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>
    /// Simulação autoritativa de uma partida do Ciclo das Lendas.
    /// Roda em tick fixo (30 Hz), não depende da Unity e é determinística para uma mesma semente
    /// e sequência de comandos — o que permite servidor autoritativo, reprodução e testes.
    /// </summary>
    public sealed class Simulation
    {
        public const float TickRate = 30f;
        public const float Dt = 1f / TickRate;

        public readonly MatchConfig Config;
        public readonly MapLayout Map;
        public readonly NavGrid Nav;
        public readonly SimRandom Random;
        public readonly MatchState Match;
        public readonly VisionSystem Vision;
        public readonly SynergySystem Synergy;
        public readonly EnvironmentDirector Environment;

        public float Time { get; private set; }
        public int TickIndex { get; private set; }

        public readonly List<Champion> Champions = new List<Champion>();
        public readonly List<Decoy> Decoys = new List<Decoy>();
        public readonly List<NeutralSpirit> Spirits = new List<NeutralSpirit>();
        public readonly List<Zone> Zones = new List<Zone>();
        public readonly List<EchoPickup> Echoes = new List<EchoPickup>();

        private readonly List<SimEvent> _events = new List<SimEvent>();
        private readonly Dictionary<int, PlayerCommand> _commands = new Dictionary<int, PlayerCommand>();
        private readonly Dictionary<int, BotBrain> _bots = new Dictionary<int, BotBrain>();
        public readonly TeamCoordinator[] Coordinators = new TeamCoordinator[2];
        private int _nextId = 1;
        private readonly List<Unit> _queryBuffer = new List<Unit>();

        public IReadOnlyList<SimEvent> Events => _events;

        public Simulation(MatchConfig config)
        {
            Config = config ?? new MatchConfig();
            Map = MapFactory.Create(Config.MapId);
            Nav = new NavGrid(Map);
            Random = new SimRandom(Config.Seed);
            Match = new MatchState(this);
            Vision = new VisionSystem(this);
            Synergy = new SynergySystem(this);
            Environment = new EnvironmentDirector(this);
            Coordinators[0] = new TeamCoordinator(this, Team.Aurora);
            Coordinators[1] = new TeamCoordinator(this, Team.Crepusculo);
        }

        public int NextId() => _nextId++;

        // ------------------------------------------------------------------ Montagem

        public Champion AddChampion(Team team, CharacterId character, string name, bool isBot)
        {
            var stats = CharacterCatalog.CreateStats(character);
            var c = new Champion
            {
                Id = NextId(),
                Team = team,
                PlayerName = name,
                Character = character,
                Stats = stats,
                IsBot = isBot,
                MaxHp = stats.MaxHp,
                Hp = stats.MaxHp,
                Radius = stats.Radius,
                Energy = 100f,
                Facing = team == Team.Aurora ? Vec2.Right : -Vec2.Right,
            };
            c.Position = SpawnPoint(team, Champions.Count(x => x.Team == team));
            c.Kit = CharacterCatalog.CreateKit(character);
            Champions.Add(c);
            c.Kit.Bind(this, c);
            if (isBot) _bots[c.Id] = new BotBrain(this, c);
            return c;
        }

        public Vec2 SpawnPoint(Team team, int index)
        {
            Vec2 center = Map.BaseCenter[(int)team];
            float angle = index * (MathF.PI * 2f / 5f);
            return center + Vec2.FromAngle(angle) * 2.5f;
        }

        public void SetCommand(int championId, PlayerCommand command) => _commands[championId] = command;

        public BotBrain BotFor(int championId) => _bots.TryGetValue(championId, out var b) ? b : null;

        public void ClearEvents() => _events.Clear();

        internal void Emit(SimEvent e) => _events.Add(e);

        public void Emit(SimEventType type, int source = 0, int target = 0, Vec2 pos = default, float value = 0f, string text = null, Team team = Team.None, int slot = 0)
        {
            _events.Add(new SimEvent { Type = type, SourceId = source, TargetId = target, Position = pos, Value = value, Text = text, Team = team, Slot = slot });
        }

        // ------------------------------------------------------------------ Laço principal

        public void Step()
        {
            float dt = Dt;
            Time += dt;
            TickIndex++;

            Environment.Tick(dt);
            Coordinators[0].Tick(dt);
            Coordinators[1].Tick(dt);

            for (int i = 0; i < Champions.Count; i++)
            {
                var c = Champions[i];
                if (!c.Alive)
                {
                    c.RespawnTimer -= dt;
                    if (c.RespawnTimer <= 0f) Respawn(c);
                    continue;
                }
                PlayerCommand cmd;
                if (c.IsBot && _bots.TryGetValue(c.Id, out var brain)) cmd = brain.Think(dt);
                else _commands.TryGetValue(c.Id, out cmd);
                UpdateChampionTimers(c, dt);
                ProcessCommand(c, cmd, dt);
                c.Kit.Tick(dt);
                // Os botões são "apertados" apenas no tick em que chegam.
                if (!c.IsBot && _commands.ContainsKey(c.Id))
                {
                    cmd.Pressed = CommandButtons.None;
                    _commands[c.Id] = cmd;
                }
            }

            TickStatuses(dt);
            IntegrateMovement(dt);
            TickZones(dt);
            TickDecoys(dt);
            NeutralAI.Tick(this, dt);
            TickBases(dt);
            Match.Tick(dt);
            Synergy.Tick(dt);
            Vision.Tick(dt);
        }

        /// <summary>Avança a simulação por um tempo (testes e partidas sem apresentação).</summary>
        public void Run(float seconds, bool clearEvents = true)
        {
            int ticks = (int)MathF.Ceiling(seconds * TickRate);
            for (int i = 0; i < ticks; i++)
            {
                if (clearEvents) _events.Clear();
                Step();
                if (Match.Phase == MatchPhase.Encerrada) break;
            }
        }

        private void UpdateChampionTimers(Champion c, float dt)
        {
            for (int s = 0; s < c.Cooldowns.Length; s++) if (c.Cooldowns[s] > 0f) c.Cooldowns[s] -= dt;
            if (c.DodgeCooldown > 0f) c.DodgeCooldown -= dt;
            if (c.JumpCooldown > 0f) c.JumpCooldown -= dt;
            if (c.CastLock > 0f) c.CastLock -= dt;
            c.TimeSinceDamaged += dt;
            c.TimeSinceAttack += dt;
            c.Energy = MathF.Min(c.MaxEnergy, c.Energy + c.Stats.EnergyRegen * dt);
            c.UltCharge = MathF.Min(100f, c.UltCharge + 1f * dt);
            if (Config.InfiniteResources) { c.Energy = c.MaxEnergy; c.UltCharge = 100f; }
        }

        // ------------------------------------------------------------------ Comandos

        private void ProcessCommand(Champion c, PlayerCommand cmd, float dt)
        {
            Vec2 toAim = cmd.AimPoint - c.Position;
            if (toAim.SqrLength > 0.04f && c.CanAct) c.Facing = toAim.Normalized;

            for (int s = 1; s <= 4; s++)
            {
                var slot = (AbilitySlot)s;
                if (!cmd.IsPressed(PlayerCommand.ButtonFor(slot))) continue;
                TryCast(c, slot, cmd.AimPoint);
            }

            if (cmd.IsPressed(CommandButtons.Esquiva)) TryDodge(c, cmd.Move);
            if (cmd.IsPressed(CommandButtons.Salto)) TryJump(c);
            if (cmd.Attack) TryBasicAttack(c);

            // Movimento voluntário.
            Vec2 move = cmd.Move.ClampLength(1f);
            c.Kit.OnMoveInput(move, dt);
            bool wantsSprint = cmd.Sprint && move.SqrLength > 0.01f && c.Stamina > 1f;
            c.Sprinting = wantsSprint && c.CanMove;
            if (c.Sprinting) c.Stamina = MathF.Max(0f, c.Stamina - 22f * dt);
            else c.Stamina = MathF.Min(100f, c.Stamina + 14f * dt);

            if (c.CanMove) c.Velocity = move * CurrentSpeed(c);
            else c.Velocity = Vec2.Zero;

            var wind = c.Status.Find(StatusType.Ventania);
            if (wind != null && !c.Status.Has(StatusType.Imparavel)) c.Velocity += wind.Direction * wind.Magnitude;
        }

        public float CurrentSpeed(Champion c)
        {
            float speed = c.Stats.MoveSpeed * c.Kit.SpeedMultiplier;
            var terrain = Map.TerrainAt(c.Position);
            if (terrain == TerrainKind.Agua && !c.Airborne) speed *= c.Kit.IsAquatic ? 1.2f : 0.8f;
            if (!c.Kit.IgnoresSlows && !c.Status.Has(StatusType.Imparavel)) speed *= 1f - MathUtil.Clamp(c.Status.MagnitudeOf(StatusType.Lentidao), 0f, 0.8f);
            speed *= 1f + c.Status.MagnitudeOf(StatusType.Pressa);
            if (c.Sprinting) speed *= 1.3f;
            return speed;
        }

        public bool CanCast(Champion c, AbilitySlot slot)
        {
            if (!c.CanAct) return false;
            var def = c.Stats.Ability(slot);
            if (def == null) return false;
            if (c.Cooldowns[(int)slot] > 0f) return false;
            if (c.Energy < def.EnergyCost) return false;
            if (slot == AbilitySlot.Suprema && c.UltCharge < 100f) return false;
            return true;
        }

        public bool TryCast(Champion c, AbilitySlot slot, Vec2 aim)
        {
            if (!c.Alive) return false;
            if (c.CanAct && c.Kit.TryRecast(slot, aim))
            {
                Emit(SimEventType.AbilityRecast, c.Id, 0, c.Position, 0f, c.Stats.Ability(slot)?.Name, c.Team, (int)slot);
                return true;
            }
            if (!CanCast(c, slot)) return false;
            var def = c.Stats.Ability(slot);
            if (!c.Kit.Cast(slot, aim)) return false;
            c.Cooldowns[(int)slot] = Config.InfiniteResources ? def.Cooldown * 0.25f : def.Cooldown;
            c.Energy -= def.EnergyCost;
            if (slot == AbilitySlot.Suprema) c.UltCharge = 0f;
            c.TimeSinceAttack = 0f;
            Emit(SimEventType.AbilityCast, c.Id, 0, c.Position, 0f, def.Name, c.Team, (int)slot);
            return true;
        }

        private void TryDodge(Champion c, Vec2 move)
        {
            if (c.DodgeCooldown > 0f || !c.CanMove) return;
            Vec2 dir = move.SqrLength > 0.01f ? move.Normalized : c.Facing;
            c.ForcedVelocity = dir * (5f / 0.2f);
            c.ForcedTime = 0.2f;
            c.InvulnerableTime = 0.25f;
            c.DodgeCooldown = 4.5f;
            Emit(SimEventType.Dodge, c.Id, 0, c.Position, 0f, null, c.Team);
        }

        private void TryJump(Champion c)
        {
            if (c.JumpCooldown > 0f || c.Airborne || !c.CanMove) return;
            c.AirborneTime = 0.65f;
            c.JumpCooldown = 1.2f;
            Emit(SimEventType.Jump, c.Id, 0, c.Position, 0f, null, c.Team);
        }

        private void TryBasicAttack(Champion c)
        {
            if (!c.CanAct || !c.Kit.CanBasicAttack) return;
            if (c.Cooldowns[(int)AbilitySlot.Basico] > 0f) return;
            c.Cooldowns[(int)AbilitySlot.Basico] = c.Stats.BasicInterval;
            c.TimeSinceAttack = 0f;
            Emit(SimEventType.BasicAttack, c.Id, 0, c.Position, 0f, null, c.Team);
            if (c.Status.Has(StatusType.Ofuscado))
            {
                Emit(SimEventType.BasicMiss, c.Id, 0, c.Position, 0f, "Ofuscado", c.Team);
                return;
            }
            float range = c.Stats.BasicRange * c.Kit.RadiusMultiplier;
            UnitsInCone(c.Position, c.Facing, range, c.Stats.BasicArcDeg, c.Team, _queryBuffer);
            foreach (var u in _queryBuffer)
            {
                DealDamage(c, u, c.Stats.BasicDamage * c.Kit.DamageMultiplier);
                c.Kit.OnBasicHit(u);
            }
        }

        // ------------------------------------------------------------------ Dano, cura e controle

        public float DealDamage(Champion source, Unit target, float amount)
        {
            if (target == null || !target.Targetable || amount <= 0f) return 0f;
            if (source != null && source.Team == target.Team && target.Team != Team.None) return 0f;

            if (target is Decoy d)
            {
                KillDecoy(d, source);
                return 0f;
            }

            if (target is Champion defender) amount *= defender.Kit.DamageTakenMultiplier;
            float remaining = target.Status.AbsorbDamage(amount);
            float dealt = MathF.Min(target.Hp, remaining);
            target.Hp -= remaining;

            if (source != null)
            {
                source.MatchStats.DamageDealt += dealt;
                source.UltCharge = MathF.Min(100f, source.UltCharge + dealt * 0.05f);
                source.TimeSinceAttack = 0f;
            }

            if (target is Champion tc)
            {
                tc.MatchStats.DamageTaken += dealt;
                tc.TimeSinceDamaged = 0f;
                if (source != null) tc.RecentAttackers[source.Id] = Time;
            }
            if (target is NeutralSpirit sp && source != null)
            {
                sp.LastHitterId = source.Id;
                if (sp.TargetId < 0) sp.TargetId = source.Id;
            }

            Emit(SimEventType.Damage, source?.Id ?? 0, target.Id, target.Position, amount, null, source?.Team ?? Team.None);

            if (target.Hp <= 0f)
            {
                if (target is Champion dead) KillChampion(dead, source);
                else if (target is NeutralSpirit spirit) NeutralAI.Defeat(this, spirit);
            }
            return amount;
        }

        public void Heal(Champion source, Unit target, float amount)
        {
            if (target == null || !target.Alive || amount <= 0f) return;
            float healed = MathF.Min(amount, target.MaxHp - target.Hp);
            if (healed <= 0f) return;
            target.Hp += healed;
            if (source != null) source.MatchStats.Healing += healed;
        }

        /// <summary>Aplica efeito respeitando Imparável e esquiva.</summary>
        public bool ApplyStatus(Unit target, StatusType type, float duration, float magnitude, Champion source, Vec2 direction = default)
        {
            if (target == null || !target.Alive) return false;
            bool hostile = type != StatusType.Escudo && type != StatusType.Pressa && type != StatusType.Imparavel;
            if (hostile)
            {
                if (target.InvulnerableTime > 0f) return false;
                if (type != StatusType.Queimadura && target.Status.Has(StatusType.Imparavel)) return false;
                if (source != null && source.Team == target.Team) return false;
            }
            bool applied = target.Status.Apply(type, duration, magnitude, source?.Id ?? 0, direction);
            if (applied && type == StatusType.Atordoado && target is Champion c && c.CastLock > 0f)
            {
                c.CastLock = 0f;
                Emit(SimEventType.Interrupted, source?.Id ?? 0, c.Id, c.Position);
            }
            return applied;
        }

        private void KillChampion(Champion dead, Champion killer)
        {
            dead.Alive = false;
            dead.Hp = 0f;
            dead.Velocity = Vec2.Zero;
            dead.ForcedTime = 0f;
            dead.Status.Clear();
            dead.MatchStats.Deaths++;
            float minutes = Time / 60f;
            dead.RespawnTimer = MathF.Min(Config.RespawnMax, Config.RespawnBase + Config.RespawnPerMinute * minutes);
            dead.Kit.OnDeath();

            if (killer != null && killer.Team != dead.Team)
            {
                killer.MatchStats.Kills++;
                killer.Energy = MathF.Min(killer.MaxEnergy, killer.Energy + 30f);
                killer.UltCharge = MathF.Min(100f, killer.UltCharge + 15f);
                Match.AddMemory(killer.Team, Config.KillMemory);
            }
            foreach (var kv in dead.RecentAttackers)
            {
                if (killer != null && kv.Key == killer.Id) continue;
                if (Time - kv.Value > 8f) continue;
                if (FindUnit(kv.Key) is Champion helper && helper.Team != dead.Team) helper.MatchStats.Assists++;
            }
            dead.RecentAttackers.Clear();
            Emit(SimEventType.Death, killer?.Id ?? 0, dead.Id, dead.Position, dead.RespawnTimer, null, dead.Team);
        }

        private void Respawn(Champion c)
        {
            c.Alive = true;
            c.Hp = c.MaxHp;
            c.Energy = c.MaxEnergy;
            c.Position = SpawnPoint(c.Team, Champions.IndexOf(c) % 5);
            c.Velocity = Vec2.Zero;
            c.ForcedTime = 0f;
            c.InvulnerableTime = 1.5f;
            c.Status.Clear();
            c.Kit.OnRespawn();
            Emit(SimEventType.Respawn, c.Id, c.Id, c.Position, 0f, null, c.Team);
        }

        public void KillDecoy(Decoy d, Champion source)
        {
            if (!d.Alive) return;
            d.Alive = false;
            Emit(SimEventType.DecoyBroken, source?.Id ?? 0, d.Id, d.Position, 0f, null, d.Team);
        }

        // ------------------------------------------------------------------ Física simplificada

        private void TickStatuses(float dt)
        {
            for (int i = 0; i < Champions.Count; i++) TickUnitStatus(Champions[i], dt);
            for (int i = 0; i < Spirits.Count; i++) TickUnitStatus(Spirits[i], dt);
        }

        private void TickUnitStatus(Unit u, float dt)
        {
            if (!u.Alive) return;
            if (u.InvulnerableTime > 0f) u.InvulnerableTime -= dt;
            if (u.AirborneTime > 0f) u.AirborneTime -= dt;
            var burn = u.Status.Find(StatusType.Queimadura);
            if (burn != null)
            {
                var src = FindUnit(burn.SourceId) as Champion;
                // Dano direto (não consome invulnerabilidade de esquiva para não anular queimaduras longas).
                if (u.InvulnerableTime <= 0f) DealDamage(src, u, burn.Magnitude * dt);
            }
            u.Status.Tick(dt);
        }

        private void IntegrateMovement(float dt)
        {
            foreach (var c in Champions)
            {
                if (!c.Alive) continue;
                MoveUnit(c, dt);
            }
            // Separação suave entre entidades.
            for (int i = 0; i < Champions.Count; i++)
            {
                var a = Champions[i];
                if (!a.Alive) continue;
                for (int j = i + 1; j < Champions.Count; j++)
                {
                    var b = Champions[j];
                    if (!b.Alive || a.Airborne || b.Airborne) continue;
                    float ra = a.Radius * a.Kit.RadiusMultiplier, rb = b.Radius * b.Kit.RadiusMultiplier;
                    Vec2 d = b.Position - a.Position;
                    float dist = d.Length;
                    float min = (ra + rb) * 0.9f;
                    if (dist >= min || dist < 1e-4f) continue;
                    Vec2 n = d / dist;
                    float push = (min - dist) * 0.5f;
                    a.Position = ResolveObstacles(a.Position - n * push, ra);
                    b.Position = ResolveObstacles(b.Position + n * push, rb);
                }
            }
        }

        public void MoveUnit(Unit u, float dt)
        {
            Vec2 step;
            if (u.ForcedTime > 0f)
            {
                step = u.ForcedVelocity * dt;
                u.ForcedTime -= dt;
            }
            else step = u.Velocity * dt;
            float r = u.Radius * ((u as Champion)?.Kit.RadiusMultiplier ?? 1f);
            u.Position = ResolveObstacles(u.Position + step, r);
            if (step.SqrLength > 1e-6f && u.ForcedTime <= 0f && !(u is Champion)) u.Facing = step.Normalized;
        }

        public Vec2 ResolveObstacles(Vec2 p, float radius)
        {
            for (int iter = 0; iter < 3; iter++)
            {
                bool moved = false;
                foreach (var o in Map.Obstacles)
                {
                    if (!o.Active) continue;
                    var np = o.PushOut(p, radius);
                    if (np != p) { p = np; moved = true; }
                }
                if (!moved) break;
            }
            return Map.ClampToBounds(p, radius);
        }

        // ------------------------------------------------------------------ Zonas, ilusões, bases

        public Zone AddZone(ZoneKind kind, Champion owner, Vec2 pos, float radius, float duration, int followId = -1)
        {
            var z = new Zone
            {
                Id = NextId(),
                Kind = kind,
                OwnerId = owner?.Id ?? 0,
                Team = owner?.Team ?? Team.None,
                Position = pos,
                Radius = radius,
                Remaining = duration,
                Duration = duration,
                FollowId = followId,
            };
            Zones.Add(z);
            return z;
        }

        private void TickZones(float dt)
        {
            for (int i = Zones.Count - 1; i >= 0; i--)
            {
                var z = Zones[i];
                z.Remaining -= dt;
                if (z.FollowId >= 0)
                {
                    var f = FindUnit(z.FollowId);
                    if (f != null && f.Alive) z.Position = f.Position;
                }
                var owner = FindUnit(z.OwnerId) as Champion;
                switch (z.Kind)
                {
                    case ZoneKind.RastroDeFogo:
                        z.TickTimer -= dt;
                        if (z.TickTimer <= 0f)
                        {
                            z.TickTimer = 0.25f;
                            ForEachEnemyInRadius(z.Position, z.Radius, z.Team, u =>
                            {
                                if (!u.Airborne) DealDamage(owner, u, 24f * 0.25f);
                            });
                        }
                        break;
                    case ZoneKind.ReinoDosRedemoinhos:
                        ForEachEnemyInRadius(z.Position, z.Radius, z.Team, u => ApplyStatus(u, StatusType.Lentidao, 0.3f, 0.25f, owner));
                        break;
                    case ZoneKind.TempestadeDeBrasas:
                        ForEachEnemyInRadius(z.Position, z.Radius, z.Team, u =>
                        {
                            DealDamage(owner, u, 45f * dt);
                            if (!u.Status.Has(StatusType.Imparavel))
                            {
                                Vec2 toCenter = z.Position - u.Position;
                                if (toCenter.SqrLength > 0.25f) u.Position = ResolveObstacles(u.Position + toCenter.Normalized * 2.5f * dt, u.Radius);
                            }
                        });
                        break;
                }
                if (z.Expired) Zones.RemoveAt(i);
            }
        }

        public Decoy AddDecoy(Champion owner, Vec2 pos, Vec2 dir, float speed, float lifetime)
        {
            var d = new Decoy
            {
                Id = NextId(),
                OwnerId = owner.Id,
                Team = owner.Team,
                Character = owner.Character,
                Position = pos,
                Facing = dir.SqrLength > 0.01f ? dir.Normalized : owner.Facing,
                Radius = owner.Radius,
                MaxHp = owner.MaxHp,
                Hp = owner.Hp,
                Speed = speed,
                Lifetime = lifetime,
            };
            d.Velocity = d.Facing * speed;
            Decoys.Add(d);
            return d;
        }

        private void TickDecoys(float dt)
        {
            for (int i = Decoys.Count - 1; i >= 0; i--)
            {
                var d = Decoys[i];
                d.Lifetime -= dt;
                if (d.Alive)
                {
                    d.Velocity = d.Facing * d.Speed;
                    MoveUnit(d, dt);
                }
                if (d.Lifetime <= 0f && d.Alive) d.Alive = false;
                if (!d.Alive) Decoys.RemoveAt(i);
            }
        }

        private void TickBases(float dt)
        {
            foreach (var c in Champions)
            {
                if (!c.Alive) continue;
                for (int t = 0; t < 2; t++)
                {
                    if (Vec2.Distance(c.Position, Map.BaseCenter[t]) > Map.BaseRadius) continue;
                    if ((int)c.Team == t)
                    {
                        Heal(null, c, c.MaxHp * 0.2f * dt);
                        c.Energy = MathF.Min(c.MaxEnergy, c.Energy + 25f * dt);
                    }
                    else
                    {
                        // O Altar protege quem renasce: invasores sofrem dano.
                        DealDamage(null, c, 120f * dt);
                    }
                }
            }
        }

        // ------------------------------------------------------------------ Consultas

        public Unit FindUnit(int id)
        {
            if (id <= 0) return null;
            for (int i = 0; i < Champions.Count; i++) if (Champions[i].Id == id) return Champions[i];
            for (int i = 0; i < Decoys.Count; i++) if (Decoys[i].Id == id) return Decoys[i];
            for (int i = 0; i < Spirits.Count; i++) if (Spirits[i].Id == id) return Spirits[i];
            return null;
        }

        public Champion FindChampion(int id)
        {
            for (int i = 0; i < Champions.Count; i++) if (Champions[i].Id == id) return Champions[i];
            return null;
        }

        /// <summary>Unidades hostis a <paramref name="team"/> que podem receber dano (entidades, ilusões, assombrações).</summary>
        public IEnumerable<Unit> HostileUnits(Team team)
        {
            for (int i = 0; i < Champions.Count; i++) if (Champions[i].Alive && Champions[i].Team != team) yield return Champions[i];
            for (int i = 0; i < Decoys.Count; i++) if (Decoys[i].Alive && Decoys[i].Team != team) yield return Decoys[i];
            for (int i = 0; i < Spirits.Count; i++) if (Spirits[i].Alive) yield return Spirits[i];
        }

        public void ForEachEnemyInRadius(Vec2 center, float radius, Team team, Action<Unit> action)
        {
            _queryBuffer.Clear();
            foreach (var u in HostileUnits(team))
                if (Vec2.Distance(u.Position, center) <= radius + u.Radius) _queryBuffer.Add(u);
            var copy = _queryBuffer.ToArray();
            foreach (var u in copy) action(u);
        }

        public void UnitsInCone(Vec2 origin, Vec2 dir, float range, float arcDeg, Team team, List<Unit> result)
        {
            result.Clear();
            float half = arcDeg * 0.5f * MathUtil.Deg2Rad;
            foreach (var u in HostileUnits(team))
            {
                Vec2 to = u.Position - origin;
                float dist = to.Length;
                if (dist > range + u.Radius) continue;
                if (dist > u.Radius + 0.3f && Vec2.AngleBetween(dir, to) > half) continue;
                result.Add(u);
            }
        }

        public List<Unit> ConeQuery(Vec2 origin, Vec2 dir, float range, float arcDeg, Team team)
        {
            var list = new List<Unit>();
            UnitsInCone(origin, dir, range, arcDeg, team, list);
            return list;
        }
    }

    internal static class EnumerableExt
    {
        public static int Count<T>(this List<T> list, Func<T, bool> pred)
        {
            int n = 0;
            for (int i = 0; i < list.Count; i++) if (pred(list[i])) n++;
            return n;
        }
    }
}
