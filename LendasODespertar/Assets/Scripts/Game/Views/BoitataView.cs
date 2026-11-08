using Lendas.Core;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>
    /// Boitatá: serpente feita de escamas luminosas e fogo. Cada segmento do corpo é desenhado
    /// exatamente onde a simulação o colocou (colisão segmentada). O brilho acompanha o Calor.
    /// </summary>
    public sealed class BoitataView : UnitView
    {
        private Transform _head;
        private Transform _jaw;
        private Material _scaleMat;
        private Material _eyeMat;
        private Light _light;
        private readonly Transform[] _segments = new Transform[BoitataKit.GiantSegments];
        private readonly ParticleSystem[] _segmentFire = new ParticleSystem[BoitataKit.GiantSegments];
        private ParticleSystem _headFire;
        private float _bite;

        public override float HeadHeight => 1.4f;

        protected override void Build()
        {
            _scaleMat = MaterialFactory.Emissive(new Color(0.25f, 0.06f, 0.02f), new Color(1f, 0.35f, 0.05f), 1f);
            _eyeMat = MaterialFactory.Emissive(new Color(1f, 0.95f, 0.7f), new Color(1f, 0.9f, 0.5f), 4f);
            var dark = MaterialFactory.Lit(new Color(0.08f, 0.03f, 0.02f), 0.5f);

            _head = new GameObject("Cabeça").transform;
            _head.SetParent(Model, false);
            _head.localPosition = new Vector3(0f, 0.55f, 0f);
            ShapeFactory.Part(PrimitiveType.Sphere, _head, Vector3.zero, new Vector3(0.75f, 0.5f, 1.15f), _scaleMat, "Crânio");
            ShapeFactory.Part(PrimitiveType.Sphere, _head, new Vector3(0f, 0.12f, -0.15f), new Vector3(0.6f, 0.35f, 0.8f), _scaleMat, "Escamas da nuca");
            _jaw = ShapeFactory.Part(PrimitiveType.Sphere, _head, new Vector3(0f, -0.15f, 0.15f), new Vector3(0.55f, 0.2f, 0.9f), dark, "Mandíbula").transform;
            // Olhos intensamente brilhantes (marca da lenda).
            foreach (float side in new[] { -1f, 1f })
            {
                ShapeFactory.Part(PrimitiveType.Sphere, _head, new Vector3(0.27f * side, 0.12f, 0.32f), new Vector3(0.2f, 0.16f, 0.22f), _eyeMat, "Olho");
                // Cristas de fogo sobre os olhos.
                ShapeFactory.Cone(_head, new Vector3(0.22f * side, 0.22f, 0.05f), new Vector3(0.12f, 0.35f, 0.12f), _scaleMat, "Crista", Quaternion.Euler(-60f, 0f, -20f * side));
            }

            var segRoot = new GameObject("Corpo").transform;
            segRoot.SetParent(transform.parent, false); // os segmentos ficam no mundo, não presos à cabeça
            segRoot.name = $"Corpo do Boitatá #{Unit.Id}";
            for (int i = 0; i < _segments.Length; i++)
            {
                float t = i / (float)(_segments.Length - 1);
                float r = Mathf.Lerp(0.95f, 0.35f, t);
                var seg = ShapeFactory.Part(PrimitiveType.Sphere, segRoot, Vector3.zero, new Vector3(r, r * 0.8f, r * 1.25f), _scaleMat, $"Segmento {i}").transform;
                _segments[i] = seg;
                _segmentFire[i] = VfxFactory.Fire(seg, 0.3f, 10f, new Color(1f, 0.6f, 0.1f), new Color(1f, 0.15f, 0.02f));
            }
            _headFire = VfxFactory.Fire(_head, 0.35f, 25f, new Color(1f, 0.75f, 0.2f), new Color(1f, 0.25f, 0.02f));

            _light = new GameObject("Luz do Boitatá").AddComponent<Light>();
            _light.transform.SetParent(_head, false);
            _light.transform.localPosition = new Vector3(0f, 0.8f, 0f);
            _light.type = LightType.Point;
            _light.color = new Color(1f, 0.55f, 0.2f);
            _light.range = 7f;
            _light.shadows = LightShadows.None;
        }

        private void OnDestroy()
        {
            if (_segments[0] != null && _segments[0].parent != null) Destroy(_segments[0].parent.gameObject);
        }

        public override void OnBasicAttack()
        {
            base.OnBasicAttack();
            _bite = 1f;
        }

        public override void Sync(float dt)
        {
            base.Sync(dt);
            var champ = Unit as Champion;
            var kit = champ?.Kit as BoitataKit;
            if (kit == null) return;
            float heat01 = kit.Heat / BoitataKit.MaxHeat;
            float scale = kit.RadiusMultiplier;

            // Brilho das escamas e luz seguem o Calor; na forma gigante, chama celeste branca-amarelada.
            Color glow = kit.GiantForm ? new Color(1f, 0.85f, 0.45f) : Color.Lerp(new Color(0.9f, 0.25f, 0.03f), new Color(1f, 0.6f, 0.15f), heat01);
            MaterialFactory.SetEmission(_scaleMat, glow * Mathf.Lerp(0.6f, 3.2f, heat01));
            _light.intensity = Mathf.Lerp(0.8f, 3.5f, heat01) * (kit.GiantForm ? 1.6f : 1f);
            _light.range = 6f * scale + heat01 * 4f;

            _head.localScale = Vector3.one * scale;
            _head.localPosition = new Vector3(0f, 0.55f * scale + Mathf.Sin(AnimTime * 6f) * 0.05f, 0f) + HitShake();
            if (_bite > 0f) _bite = Mathf.Max(0f, _bite - dt * 5f);
            _head.localRotation = Quaternion.Euler(-_bite * 25f, 0f, Mathf.Sin(AnimTime * 4f) * 6f);
            _jaw.localRotation = Quaternion.Euler(_bite * 35f, 0f, 0f);

            var segs = kit.Segments;
            for (int i = 0; i < _segments.Length; i++)
            {
                bool active = Unit.Alive && i < segs.Count;
                _segments[i].gameObject.SetActive(active);
                if (!active) continue;
                Vector3 p = segs[i].ToWorld(0.42f * scale + Mathf.Sin(AnimTime * 7f - i * 0.7f) * 0.07f);
                _segments[i].position = Vector3.Lerp(_segments[i].position, p, 1f - Mathf.Exp(-dt * 25f));
                if ((_segments[i].position - p).sqrMagnitude > 9f) _segments[i].position = p;
                Vector3 ahead = i == 0 ? transform.position : _segments[i - 1].position;
                Vector3 dir = ahead - _segments[i].position;
                dir.y = 0f;
                if (dir.sqrMagnitude > 1e-4f) _segments[i].rotation = Quaternion.LookRotation(dir);
                float t = i / (float)(segs.Count - 1);
                float r = Mathf.Lerp(0.95f, 0.35f, t) * scale;
                _segments[i].localScale = new Vector3(r, r * 0.8f, r * 1.25f);
                var em = _segmentFire[i].emission;
                em.rateOverTime = heat01 >= BoitataKit.BurningBodyHeat / 100f ? 18f : 3f + heat01 * 6f;
            }
        }
    }
}
