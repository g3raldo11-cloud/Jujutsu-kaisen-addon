using System.Collections.Generic;

namespace Lendas.Core
{
    public sealed class StatusEffect
    {
        public StatusType Type;
        public float Remaining;
        public float Magnitude;
        public Vec2 Direction;
        public int SourceId;

        public bool IsCrowdControl =>
            Type == StatusType.Lentidao || Type == StatusType.Enraizado || Type == StatusType.Atordoado ||
            Type == StatusType.Ofuscado || Type == StatusType.Ventania;
    }

    /// <summary>Contêiner de efeitos de status com regras de acúmulo previsíveis.</summary>
    public sealed class StatusContainer
    {
        private readonly List<StatusEffect> _effects = new List<StatusEffect>();
        public IReadOnlyList<StatusEffect> Effects => _effects;

        /// <summary>Aplica um efeito. Efeitos do mesmo tipo não somam: fica o mais forte e renova a duração.</summary>
        public bool Apply(StatusType type, float duration, float magnitude, int sourceId, Vec2 direction = default)
        {
            if (duration <= 0f) return false;
            var existing = Find(type);
            if (type == StatusType.Escudo)
            {
                if (existing != null)
                {
                    existing.Magnitude += magnitude;
                    if (existing.Magnitude > 600f) existing.Magnitude = 600f;
                    if (duration > existing.Remaining) existing.Remaining = duration;
                    return true;
                }
            }
            else if (existing != null)
            {
                if (magnitude >= existing.Magnitude) { existing.Magnitude = magnitude; existing.Direction = direction; existing.SourceId = sourceId; }
                if (duration > existing.Remaining) existing.Remaining = duration;
                return true;
            }
            _effects.Add(new StatusEffect { Type = type, Remaining = duration, Magnitude = magnitude, SourceId = sourceId, Direction = direction });
            return true;
        }

        public StatusEffect Find(StatusType type)
        {
            for (int i = 0; i < _effects.Count; i++) if (_effects[i].Type == type) return _effects[i];
            return null;
        }

        public bool Has(StatusType type) => Find(type) != null;
        public float MagnitudeOf(StatusType type) => Find(type)?.Magnitude ?? 0f;

        public void Remove(StatusType type) => _effects.RemoveAll(e => e.Type == type);
        public void Clear() => _effects.Clear();

        public void RemoveCrowdControl() => _effects.RemoveAll(e => e.IsCrowdControl);

        /// <summary>Consome escudo; devolve o dano que sobrou.</summary>
        public float AbsorbDamage(float damage)
        {
            var shield = Find(StatusType.Escudo);
            if (shield == null) return damage;
            if (shield.Magnitude >= damage) { shield.Magnitude -= damage; if (shield.Magnitude <= 0.01f) _effects.Remove(shield); return 0f; }
            damage -= shield.Magnitude;
            _effects.Remove(shield);
            return damage;
        }

        public void Tick(float dt)
        {
            for (int i = _effects.Count - 1; i >= 0; i--)
            {
                _effects[i].Remaining -= dt;
                if (_effects[i].Remaining <= 0f) _effects.RemoveAt(i);
            }
        }
    }
}
