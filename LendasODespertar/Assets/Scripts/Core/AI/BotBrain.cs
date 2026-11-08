using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    public enum BotGoal { Coletar, Capturar, Defender, Coracao, Recuar, Lutar, Agrupar }

    /// <summary>
    /// Bot de entidade: decide entre objetivo, combate e recuo com base no que sua equipe enxerga
    /// (não trapaceia com a névoa de guerra), coopera via <see cref="TeamCoordinator"/> e usa
    /// as habilidades por meio da lógica específica de cada kit.
    /// </summary>
    public sealed class BotBrain
    {
        private readonly Simulation _sim;
        public readonly Champion Self;
        private readonly BotContext _ctx = new BotContext();
        private readonly List<Vec2> _path = new List<Vec2>();
        private int _pathIndex;
        private Vec2 _pathGoal;
        private int _pathNavVersion;
        private float _thinkTimer;
        private float _repathTimer;
        private float _stuckTimer;
        private Vec2 _stuckAnchor;
        private float _lastHp;
        private float _hpCheckTimer;
        private Vec2 _wanderOffset;
        private float _wanderTimer;
        private PlayerCommand _cmd;

        public BotGoal Goal { get; private set; } = BotGoal.Coletar;
        public Vec2 Objective { get; set; }
        public float ObjectiveRadius { get; set; } = 1f;
        public BotGoal AssignedGoal { get; set; } = BotGoal.Coletar;
        public int TargetId => _ctx.Target?.Id ?? -1;
        /// <summary>Dificuldade 0..1: tempo de reação e precisão.</summary>
        public float Skill = 0.75f;

        public BotBrain(Simulation sim, Champion self)
        {
            _sim = sim;
            Self = self;
            _lastHp = self.Hp;
            Objective = self.Position;
        }

        public PlayerCommand Think(float dt)
        {
            _thinkTimer -= dt;
            _repathTimer -= dt;
            _hpCheckTimer -= dt;
            _wanderTimer -= dt;

            if (_thinkTimer <= 0f)
            {
                _thinkTimer = 0.25f + (1f - Skill) * 0.25f;
                Decide();
            }
            else
            {
                // Entre decisões mantém o movimento e o ataque, sem reapertar botões.
                _cmd.Pressed = CommandButtons.None;
                UpdateMovement();
                if (_ctx.Target != null && _ctx.Target.Alive)
                {
                    _cmd.AimPoint = Lead(_ctx.Target);
                    _cmd.Attack = Vec2.Distance(_ctx.Target.Position, Self.Position) <= Self.Stats.BasicRange * Self.Kit.RadiusMultiplier + _ctx.Target.Radius;
                }
            }
            CheckStuck(dt);
            return _cmd;
        }

        private void Decide()
        {
            _cmd = default;
            _ctx.Sim = _sim;
            _ctx.Self = Self;
            _ctx.Command = default;
            _ctx.UsedAbility = false;
            _ctx.MoveOverride = null;
            _ctx.VisibleEnemies.Clear();

            foreach (var u in _sim.HostileUnits(Self.Team))
            {
                if (u is NeutralSpirit) { if (Vec2.Distance(u.Position, Self.Position) < 8f && _sim.Vision.IsVisibleTo(Self.Team, u)) _ctx.VisibleEnemies.Add(u); continue; }
                if (_sim.Vision.IsVisibleTo(Self.Team, u)) _ctx.VisibleEnemies.Add(u);
            }

            int alliesNear = 0;
            foreach (var a in _sim.Champions)
                if (a != Self && a.Alive && a.Team == Self.Team && Vec2.Distance(a.Position, Self.Position) < 12f) alliesNear++;
            int enemiesNear = 0;
            foreach (var e in _ctx.VisibleEnemies)
                if (!(e is NeutralSpirit) && Vec2.Distance(e.Position, Self.Position) < 12f) enemiesNear++;
            _ctx.AlliesNear = alliesNear;
            _ctx.EnemiesNear = enemiesNear;

            // Recuo: vida baixa, ou muito em desvantagem numérica.
            bool inBase = Vec2.Distance(Self.Position, _sim.Map.BaseCenter[(int)Self.Team]) < _sim.Map.BaseRadius - 1f;
            if (Goal == BotGoal.Recuar)
            {
                if (Self.HpFraction > 0.85f || (inBase && Self.HpFraction > 0.7f)) Goal = AssignedGoal;
            }
            else if (Self.HpFraction < 0.25f || (Self.HpFraction < 0.45f && enemiesNear > alliesNear + 1))
            {
                Goal = BotGoal.Recuar;
            }
            else Goal = AssignedGoal;
            _ctx.Retreating = Goal == BotGoal.Recuar;

            // Escolha de alvo: foco da equipe, depois o mais vulnerável por perto.
            Unit target = null;
            if (!_ctx.Retreating)
            {
                float engage = Self.HpFraction > 0.5f ? 11f : 7f;
                var focus = _sim.Coordinators[(int)Self.Team].FocusTarget;
                if (focus != null && focus.Alive && _sim.Vision.IsVisibleTo(Self.Team, focus) && Vec2.Distance(focus.Position, Self.Position) < engage + 2f)
                    target = focus;
                float best = float.MaxValue;
                if (target == null)
                    foreach (var e in _ctx.VisibleEnemies)
                    {
                        float d = Vec2.Distance(e.Position, Self.Position);
                        if (d > engage) continue;
                        // Não persegue alvos distantes de seu objetivo (não "só persegue o jogador").
                        if (Vec2.Distance(e.Position, Objective) > 22f && d > 4f) continue;
                        if (e is NeutralSpirit && enemiesNear > 0) continue;
                        float score = d + e.HpFraction * 6f - (e is Champion ? 2f : 0f);
                        if (score < best) { best = score; target = e; }
                    }
                // Sem vantagem e fora de objetivo: não força briga.
                if (target is Champion && enemiesNear > alliesNear + 2 && Goal != BotGoal.Defender && Goal != BotGoal.Coracao) target = null;
            }
            _ctx.Target = target;
            _ctx.TargetDistance = target != null ? Vec2.Distance(target.Position, Self.Position) : 0f;
            _ctx.Objective = Objective;
            if (target != null && Goal != BotGoal.Recuar) Goal = BotGoal.Lutar;

            // Habilidades específicas da entidade.
            Self.Kit.BotUseAbilities(_ctx);
            _cmd = _ctx.Command;

            // Esquiva reativa: perdeu muita vida em pouco tempo.
            if (_hpCheckTimer <= 0f)
            {
                if (_lastHp - Self.Hp > Self.MaxHp * 0.15f && Self.DodgeCooldown <= 0f && _sim.Random.NextFloat() < 0.4f + Skill * 0.3f)
                {
                    _cmd.Pressed |= CommandButtons.Esquiva;
                    Vec2 away = target != null ? (Self.Position - target.Position).Normalized.Rotated(_sim.Random.Range(-1f, 1f)) : Self.Facing.Perpendicular;
                    _cmd.Move = away;
                }
                _lastHp = Self.Hp;
                _hpCheckTimer = 0.5f;
            }

            if (target != null)
            {
                if (!_ctx.UsedAbility) _cmd.AimPoint = Lead(target);
                float reach = Self.Stats.BasicRange * Self.Kit.RadiusMultiplier + target.Radius;
                _cmd.Attack = _ctx.TargetDistance <= reach;
            }
            else if (!_ctx.UsedAbility) _cmd.AimPoint = Self.Position + Self.Facing * 3f;

            UpdateMovement();
        }

        private Vec2 Lead(Unit target)
        {
            float lead = 0.15f * Skill;
            return target.Position + target.Velocity * lead;
        }

        private Vec2 CurrentGoalPoint()
        {
            if (Goal == BotGoal.Recuar) return _sim.Map.BaseCenter[(int)Self.Team];
            if (Goal == BotGoal.Lutar && _ctx.Target != null && _ctx.Target.Alive)
            {
                float keep = Self.Stats.BasicRange * 0.7f;
                Vec2 to = Self.Position - _ctx.Target.Position;
                return _ctx.Target.Position + (to.SqrLength > 0.01f ? to.Normalized : Vec2.Right) * keep;
            }
            if (_wanderTimer <= 0f)
            {
                _wanderTimer = 1.5f + _sim.Random.NextFloat() * 1.5f;
                _wanderOffset = _sim.Random.InsideCircle(ObjectiveRadius * 0.6f);
            }
            return Objective + _wanderOffset;
        }

        private void UpdateMovement()
        {
            if (_ctx.MoveOverride.HasValue)
            {
                _cmd.Move = _ctx.MoveOverride.Value;
                return;
            }
            Vec2 goal = CurrentGoalPoint();
            float distToGoal = Vec2.Distance(Self.Position, goal);
            if (distToGoal < 0.6f) { _cmd.Move = Vec2.Zero; return; }

            bool needRepath = _repathTimer <= 0f || Vec2.Distance(goal, _pathGoal) > 3f || _pathNavVersion != _sim.Nav.Version || _pathIndex >= _path.Count;
            if (needRepath)
            {
                _repathTimer = 1f;
                _pathGoal = goal;
                _pathNavVersion = _sim.Nav.Version;
                if (_sim.Nav.Walkable(Self.Position, goal)) { _path.Clear(); _path.Add(goal); }
                else _sim.Nav.FindPath(Self.Position, goal, _path);
                _pathIndex = 0;
            }

            while (_pathIndex < _path.Count && Vec2.Distance(Self.Position, _path[_pathIndex]) < 0.8f) _pathIndex++;
            Vec2 next = _pathIndex < _path.Count ? _path[_pathIndex] : goal;
            Vec2 dir = (next - Self.Position).Normalized;
            _cmd.Move = dir;
            _cmd.Sprint = distToGoal > 15f && !Self.InCombat && Self.Stamina > 40f;
            if (_ctx.Target == null && _cmd.AimPoint == default) _cmd.AimPoint = Self.Position + dir * 3f;
        }

        private void CheckStuck(float dt)
        {
            if (_cmd.Move.SqrLength < 0.1f) { _stuckTimer = 0f; _stuckAnchor = Self.Position; return; }
            _stuckTimer += dt;
            if (_stuckTimer < 1.5f) return;
            if (Vec2.Distance(Self.Position, _stuckAnchor) < 0.5f)
            {
                _repathTimer = 0f;
                _path.Clear();
                _cmd.Move = _cmd.Move.Rotated(_sim.Random.Range(-2f, 2f));
            }
            _stuckTimer = 0f;
            _stuckAnchor = Self.Position;
        }
    }
}
