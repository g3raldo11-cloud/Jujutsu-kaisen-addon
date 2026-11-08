using Lendas.Core;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>
    /// Saci-Pererê: corpo pequeno e expressivo, uma única perna, carapuça vermelha, cachimbo e
    /// redemoinhos ao redor. A animação é de pulos numa perna só (compatível com a anatomia).
    /// </summary>
    public sealed class SaciView : UnitView
    {
        private Transform _body;
        private Transform _cap;
        private Transform _leg;
        private ParticleSystem _feetSwirl;
        private ParticleSystem _tornado;
        private ParticleSystem _smoke;
        private float _spin;
        private float _kick;

        public override float HeadHeight => 1.35f;

        protected override void Build()
        {
            var skin = MaterialFactory.Lit(new Color(0.33f, 0.2f, 0.12f), 0.35f);
            var red = MaterialFactory.Lit(new Color(0.78f, 0.06f, 0.05f), 0.2f);
            var cloth = MaterialFactory.Lit(new Color(0.85f, 0.78f, 0.62f), 0.1f);
            var white = MaterialFactory.Lit(Color.white, 0.6f);
            var dark = MaterialFactory.Lit(new Color(0.05f, 0.04f, 0.03f), 0.6f);
            var wood = MaterialFactory.Lit(new Color(0.42f, 0.27f, 0.13f), 0.3f);

            _body = new GameObject("Corpo").transform;
            _body.SetParent(Model, false);

            // Uma única perna, levemente flexionada.
            _leg = ShapeFactory.Part(PrimitiveType.Capsule, _body, new Vector3(0f, 0.32f, 0f), new Vector3(0.15f, 0.32f, 0.15f), skin, "Perna").transform;
            ShapeFactory.Part(PrimitiveType.Sphere, _leg, new Vector3(0f, -0.95f, 0.25f), new Vector3(1.2f, 0.35f, 1.8f), skin, "Pé");
            ShapeFactory.Part(PrimitiveType.Cylinder, _body, new Vector3(0f, 0.66f, 0f), new Vector3(0.36f, 0.09f, 0.3f), cloth, "Calção");
            ShapeFactory.Part(PrimitiveType.Capsule, _body, new Vector3(0f, 0.86f, 0f), new Vector3(0.32f, 0.24f, 0.26f), skin, "Tronco");
            // Braços abertos, gesto travesso.
            ShapeFactory.Part(PrimitiveType.Capsule, _body, new Vector3(-0.22f, 0.9f, 0.05f), new Vector3(0.09f, 0.2f, 0.09f), skin, "BraçoE", Quaternion.Euler(10f, 0f, -40f));
            ShapeFactory.Part(PrimitiveType.Capsule, _body, new Vector3(0.22f, 0.92f, 0.08f), new Vector3(0.09f, 0.2f, 0.09f), skin, "BraçoD", Quaternion.Euler(-30f, 0f, 35f));

            var head = ShapeFactory.Part(PrimitiveType.Sphere, _body, new Vector3(0f, 1.2f, 0.02f), new Vector3(0.34f, 0.36f, 0.33f), skin, "Cabeça").transform;
            // Olhos grandes e travessos.
            foreach (float side in new[] { -1f, 1f })
            {
                var eye = ShapeFactory.Part(PrimitiveType.Sphere, head, new Vector3(0.2f * side, 0.08f, 0.42f), new Vector3(0.28f, 0.22f, 0.2f), white, "Olho");
                ShapeFactory.Part(PrimitiveType.Sphere, eye.transform, new Vector3(0.15f * side, 0f, 0.4f), Vector3.one * 0.5f, dark, "Pupila");
            }
            // Sorriso.
            ShapeFactory.Part(PrimitiveType.Capsule, head, new Vector3(0f, -0.2f, 0.45f), new Vector3(0.36f, 0.05f, 0.05f), dark, "Sorriso", Quaternion.Euler(0f, 0f, 90f));

            // Carapuça vermelha caída para trás.
            _cap = ShapeFactory.Cone(head, new Vector3(0f, 0.3f, -0.05f), new Vector3(1.05f, 1.5f, 1.05f), red, "Carapuça", Quaternion.Euler(-35f, 0f, 0f)).transform;
            ShapeFactory.Part(PrimitiveType.Cylinder, head, new Vector3(0f, 0.32f, -0.02f), new Vector3(1.08f, 0.08f, 1.08f), red, "Aba");

            // Cachimbo (elemento visual).
            var pipe = ShapeFactory.Part(PrimitiveType.Cylinder, head, new Vector3(0.2f, -0.22f, 0.6f), new Vector3(0.05f, 0.18f, 0.05f), wood, "Cachimbo", Quaternion.Euler(80f, 20f, 0f)).transform;
            var bowl = ShapeFactory.Part(PrimitiveType.Cylinder, head, new Vector3(0.28f, -0.12f, 0.95f), new Vector3(0.12f, 0.1f, 0.12f), wood, "Fornilho");
            _smoke = VfxFactory.Swirl(bowl.transform, 0.05f, 0.8f, new Color(0.8f, 0.8f, 0.8f, 0.35f), 6f);
            _smoke.transform.localPosition = new Vector3(0f, 1f, 0f);

            _feetSwirl = VfxFactory.Swirl(Model, 0.45f, 0.6f, new Color(0.7f, 0.55f, 0.35f, 0.6f), 20f);
            _tornado = VfxFactory.Swirl(Model, 0.6f, 3.2f, new Color(0.75f, 0.62f, 0.42f, 0.85f), 220f);
            _tornado.Stop();
        }

        public override void OnBasicAttack()
        {
            base.OnBasicAttack();
            _kick = 1f; // pulo-chute giratório
        }

        public override void Sync(float dt)
        {
            base.Sync(dt);
            if (Unit == null) return;
            var saci = (Unit as Champion)?.Kit as SaciKit;
            bool tornado = saci != null && saci.IsTornado;
            float speed = Unit.Velocity.Length;

            // Pulos numa perna só: frequência acompanha a velocidade; parado, quica de leve.
            float hopFreq = speed > 0.5f ? 5.5f + speed * 0.4f : 2.2f;
            float hop = Mathf.Abs(Mathf.Sin(AnimTime * hopFreq * Mathf.PI * 0.5f)) * (speed > 0.5f ? 0.28f : 0.06f);
            _body.localPosition = new Vector3(0f, hop, 0f) + HitShake();
            _leg.localScale = new Vector3(0.15f, 0.32f - (0.28f - hop) * 0.12f, 0.15f);
            _body.localRotation = Quaternion.Euler(speed > 0.5f ? 12f : 0f, 0f, Mathf.Sin(AnimTime * 3f) * 4f);
            _cap.localRotation = Quaternion.Euler(-35f - hop * 40f, Mathf.Sin(AnimTime * 4f) * 10f, 0f);

            if (_kick > 0f) _kick = Mathf.Max(0f, _kick - dt * 4f);
            _spin = tornado ? _spin + dt * 1440f : (_kick > 0f ? (1f - _kick) * 360f : 0f);
            Model.localRotation = Quaternion.Euler(0f, _spin, 0f);
            Model.localScale = tornado ? new Vector3(0.7f, 1.1f, 0.7f) : Vector3.one;

            if (tornado && !_tornado.isPlaying) _tornado.Play();
            else if (!tornado && _tornado.isPlaying) _tornado.Stop();
        }
    }
}
