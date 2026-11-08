using Lendas.Core;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>
    /// Base da apresentação de uma unidade da simulação. A simulação decide tudo;
    /// a vista apenas interpola posição, anima o modelo e mostra efeitos de status.
    /// </summary>
    public abstract class UnitView : MonoBehaviour
    {
        public Unit Unit { get; private set; }
        protected Transform Model;
        protected float AnimTime;
        protected float LastHitTime = -10f;
        protected float LastAttackTime = -10f;

        private ParticleSystem _burnFx;
        private ParticleSystem _windFx;
        private GameObject _slowRing;
        private GameObject _blindHalo;

        public virtual float HeadHeight => 1.6f;

        public void Bind(Unit unit)
        {
            Unit = unit;
            name = $"{GetType().Name} #{unit.Id}";
            Model = new GameObject("Modelo").transform;
            Model.SetParent(transform, false);
            Build();
            BuildStatusFx();
            transform.position = unit.Position.ToWorld();
            transform.rotation = unit.Facing.FacingRotation();
        }

        protected abstract void Build();

        private void BuildStatusFx()
        {
            _burnFx = VfxFactory.Fire(transform, 0.35f, 25f, new Color(1f, 0.55f, 0.1f), new Color(1f, 0.2f, 0.05f));
            _burnFx.transform.localPosition = new Vector3(0f, 0.8f, 0f);
            _burnFx.Stop();
            _windFx = VfxFactory.Swirl(transform, 0.6f, 1.2f, new Color(0.85f, 0.95f, 1f, 0.8f), 40f);
            _windFx.Stop();
            _slowRing = ShapeFactory.Disc(transform, new Vector3(0f, 0.03f, 0f), 0.9f, MaterialFactory.Transparent(new Color(0.3f, 0.6f, 1f, 0.35f)), "Lentidão");
            _slowRing.SetActive(false);
            _blindHalo = ShapeFactory.Part(PrimitiveType.Sphere, transform, new Vector3(0f, HeadHeight, 0f), Vector3.one * 0.6f,
                MaterialFactory.Transparent(new Color(1f, 0.95f, 0.6f, 0.45f)), "Ofuscado");
            _blindHalo.SetActive(false);
        }

        public void OnHit() => LastHitTime = Time.time;
        public virtual void OnBasicAttack() => LastAttackTime = Time.time;

        /// <summary>Chamado todo quadro pela <see cref="ArenaGame"/>.</summary>
        public virtual void Sync(float dt)
        {
            if (Unit == null) return;
            AnimTime += dt;
            float height = 0f;
            if (Unit.Airborne) height = Mathf.Sin(Mathf.Clamp01(1f - Unit.AirborneTime / 0.65f) * Mathf.PI) * 1.2f;
            Vector3 target = Unit.Position.ToWorld(height);
            // Interpolação suave entre ticks (30 Hz) e quadros.
            transform.position = Vector3.Lerp(transform.position, target, 1f - Mathf.Exp(-dt * 25f));
            if ((transform.position - target).sqrMagnitude > 9f) transform.position = target; // teleporte (troca, salto)
            transform.rotation = Quaternion.Slerp(transform.rotation, Unit.Facing.FacingRotation(), 1f - Mathf.Exp(-dt * 14f));
            SyncStatus();
            gameObject.SetActive(Unit.Alive);
        }

        private void SyncStatus()
        {
            var st = Unit.Status;
            Toggle(_burnFx, st.Has(StatusType.Queimadura));
            Toggle(_windFx, st.Has(StatusType.Ventania));
            _slowRing.SetActive(st.Has(StatusType.Lentidao));
            _blindHalo.SetActive(st.Has(StatusType.Ofuscado));
            if (_blindHalo.activeSelf) _blindHalo.transform.localScale = Vector3.one * (0.55f + Mathf.Sin(AnimTime * 10f) * 0.08f);
        }

        private static void Toggle(ParticleSystem ps, bool on)
        {
            if (on && !ps.isPlaying) ps.Play();
            else if (!on && ps.isPlaying) ps.Stop();
        }

        /// <summary>Tremida curta ao receber dano (feedback visual).</summary>
        protected Vector3 HitShake()
        {
            float k = Mathf.Clamp01(1f - (Time.time - LastHitTime) / 0.2f);
            if (k <= 0f) return Vector3.zero;
            return new Vector3(Mathf.Sin(Time.time * 90f), 0f, Mathf.Cos(Time.time * 70f)) * 0.06f * k;
        }
    }
}
