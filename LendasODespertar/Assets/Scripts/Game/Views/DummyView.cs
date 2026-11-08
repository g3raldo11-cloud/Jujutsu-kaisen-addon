using UnityEngine;

namespace Lendas.Game
{
    /// <summary>Boneco de teste: poste de madeira com corpo de palha e alvo pintado. Balança ao apanhar.</summary>
    public sealed class DummyView : UnitView
    {
        private Transform _pivot;
        private float _wobble;
        private float _wobbleVel;

        public override float HeadHeight => 2.1f;

        protected override void Build()
        {
            var wood = MaterialFactory.Lit(new Color(0.4f, 0.26f, 0.13f), 0.2f);
            var straw = MaterialFactory.Lit(new Color(0.86f, 0.72f, 0.38f), 0.05f);
            var red = MaterialFactory.Lit(new Color(0.75f, 0.1f, 0.08f), 0.2f);
            var white = MaterialFactory.Lit(new Color(0.95f, 0.92f, 0.85f), 0.2f);

            ShapeFactory.Part(PrimitiveType.Cylinder, Model, new Vector3(0f, 0.05f, 0f), new Vector3(0.9f, 0.05f, 0.9f), wood, "Base");
            _pivot = new GameObject("Pivô").transform;
            _pivot.SetParent(Model, false);
            _pivot.localPosition = new Vector3(0f, 0.1f, 0f);
            ShapeFactory.Part(PrimitiveType.Cylinder, _pivot, new Vector3(0f, 0.8f, 0f), new Vector3(0.12f, 0.8f, 0.12f), wood, "Poste");
            ShapeFactory.Part(PrimitiveType.Cylinder, _pivot, new Vector3(0f, 1.45f, 0f), new Vector3(0.08f, 0.6f, 0.08f), wood, "Travessa", Quaternion.Euler(0f, 0f, 90f));
            ShapeFactory.Part(PrimitiveType.Capsule, _pivot, new Vector3(0f, 1.2f, 0f), new Vector3(0.6f, 0.45f, 0.45f), straw, "Corpo de palha");
            ShapeFactory.Part(PrimitiveType.Sphere, _pivot, new Vector3(0f, 1.9f, 0f), new Vector3(0.42f, 0.42f, 0.42f), straw, "Cabeça");
            // Alvo pintado no peito (anéis).
            ShapeFactory.Part(PrimitiveType.Cylinder, _pivot, new Vector3(0f, 1.25f, 0.22f), new Vector3(0.36f, 0.01f, 0.36f), red, "Alvo", Quaternion.Euler(90f, 0f, 0f));
            ShapeFactory.Part(PrimitiveType.Cylinder, _pivot, new Vector3(0f, 1.25f, 0.23f), new Vector3(0.24f, 0.01f, 0.24f), white, "Alvo2", Quaternion.Euler(90f, 0f, 0f));
            ShapeFactory.Part(PrimitiveType.Cylinder, _pivot, new Vector3(0f, 1.25f, 0.24f), new Vector3(0.11f, 0.01f, 0.11f), red, "Alvo3", Quaternion.Euler(90f, 0f, 0f));
        }

        public override void Sync(float dt)
        {
            base.Sync(dt);
            if (Time.time - LastHitTime < dt * 1.5f) _wobbleVel += 220f;
            // Mola amortecida: balança e volta ao centro.
            _wobbleVel += (-_wobble * 60f - _wobbleVel * 6f) * dt;
            _wobble += _wobbleVel * dt;
            _pivot.localRotation = Quaternion.Euler(-Mathf.Clamp(_wobble, -35f, 35f), 0f, 0f);
        }
    }
}
