using System.Collections.Generic;
using Lendas.Core;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>
    /// Curupira (versão de fogo): corpo atlético e sobrenatural, cabelos vermelhos em combustão,
    /// pés voltados para trás, marcas luminosas como brasas e chamas que acompanham o movimento.
    /// Também desenha as Chamas Invertidas (projéteis) e as labaredas da Ira do Curupira.
    /// </summary>
    public sealed class CurupiraView : UnitView
    {
        private Transform _body;
        private Transform _legL, _legR, _armL, _armR;
        private Material _emberMat;
        private Material _hairMat;
        private ParticleSystem _hairFire;
        private ParticleSystem _trailFire;
        private Light _light;
        private readonly List<Transform> _flamePool = new List<Transform>();
        private Transform _flameRoot;
        private Transform _jet;
        private float _punch;

        public override float HeadHeight => 2f;

        protected override void Build()
        {
            var skin = MaterialFactory.Lit(new Color(0.42f, 0.24f, 0.14f), 0.35f);
            var dark = MaterialFactory.Lit(new Color(0.12f, 0.06f, 0.03f), 0.4f);
            var cloth = MaterialFactory.Lit(new Color(0.55f, 0.4f, 0.2f), 0.1f);
            _emberMat = MaterialFactory.Emissive(new Color(0.6f, 0.15f, 0.03f), new Color(1f, 0.4f, 0.05f), 2f);
            _hairMat = MaterialFactory.Emissive(new Color(0.85f, 0.12f, 0.03f), new Color(1f, 0.3f, 0.02f), 2.5f);
            var eyeMat = MaterialFactory.Emissive(new Color(1f, 0.85f, 0.5f), new Color(1f, 0.7f, 0.2f), 3f);

            _body = new GameObject("Corpo").transform;
            _body.SetParent(Model, false);

            // Pernas com pés voltados para trás (marca da lenda).
            _legL = Leg(_body, -0.14f, skin);
            _legR = Leg(_body, 0.14f, skin);

            // Tanga de fibras e tronco atlético (ombros largos, cintura fina).
            ShapeFactory.Part(PrimitiveType.Cylinder, _body, new Vector3(0f, 0.95f, 0f), new Vector3(0.42f, 0.09f, 0.32f), cloth, "Tanga");
            ShapeFactory.Part(PrimitiveType.Capsule, _body, new Vector3(0f, 1.25f, 0f), new Vector3(0.42f, 0.32f, 0.28f), skin, "Tronco");
            ShapeFactory.Part(PrimitiveType.Sphere, _body, new Vector3(0f, 1.45f, 0f), new Vector3(0.58f, 0.22f, 0.3f), skin, "Ombros");
            // Marcas luminosas semelhantes a brasas (faixas no peito e nos braços).
            for (int i = 0; i < 3; i++)
                ShapeFactory.Part(PrimitiveType.Cube, _body, new Vector3(0f, 1.15f + i * 0.1f, 0.14f), new Vector3(0.3f - i * 0.05f, 0.025f, 0.02f), _emberMat, "Marca de brasa");
            ShapeFactory.Part(PrimitiveType.Cube, _body, new Vector3(0f, 1.32f, 0.145f), new Vector3(0.025f, 0.3f, 0.02f), _emberMat, "Marca central");

            _armL = Arm(_body, -1f, skin);
            _armR = Arm(_body, 1f, skin);

            var head = ShapeFactory.Part(PrimitiveType.Sphere, _body, new Vector3(0f, 1.72f, 0.02f), new Vector3(0.28f, 0.32f, 0.29f), skin, "Cabeça").transform;
            foreach (float side in new[] { -1f, 1f })
            {
                ShapeFactory.Part(PrimitiveType.Sphere, head, new Vector3(0.18f * side, 0.06f, 0.42f), new Vector3(0.2f, 0.12f, 0.12f), eyeMat, "Olho");
                ShapeFactory.Part(PrimitiveType.Cube, head, new Vector3(0.3f * side, -0.15f, 0.38f), new Vector3(0.18f, 0.04f, 0.02f), _emberMat, "Pintura do rosto", Quaternion.Euler(0f, 0f, 20f * side));
            }
            ShapeFactory.Part(PrimitiveType.Cube, head, new Vector3(0f, -0.28f, 0.42f), new Vector3(0.22f, 0.03f, 0.02f), dark, "Boca");

            // Cabelos vermelhos em combustão: mechas cônicas para cima e para trás + fogo.
            var hair = new GameObject("Cabelo").transform;
            hair.SetParent(head, false);
            hair.localPosition = new Vector3(0f, 0.35f, -0.1f);
            for (int i = 0; i < 9; i++)
            {
                float a = (i / 8f - 0.5f) * 140f;
                float tilt = -25f - (i % 3) * 18f;
                ShapeFactory.Cone(hair, new Vector3(Mathf.Sin(a * Mathf.Deg2Rad) * 0.35f, 0f, -Mathf.Abs(a) * 0.002f),
                    new Vector3(0.45f, 1.2f + (i % 2) * 0.5f, 0.45f), _hairMat, "Mecha", Quaternion.Euler(tilt, 0f, -a * 0.6f));
            }
            _hairFire = VfxFactory.Fire(hair, 0.35f, 45f, new Color(1f, 0.55f, 0.1f), new Color(1f, 0.15f, 0.02f));
            _hairFire.transform.localPosition = new Vector3(0f, 0.6f, -0.2f);

            // Chamas que acompanham o movimento (rastro nos pés).
            _trailFire = VfxFactory.Fire(Model, 0.25f, 0f, new Color(1f, 0.5f, 0.1f), new Color(1f, 0.2f, 0.02f));
            _trailFire.transform.localPosition = new Vector3(0f, 0.15f, 0f);

            _light = new GameObject("Luz do Curupira").AddComponent<Light>();
            _light.transform.SetParent(head, false);
            _light.transform.localPosition = new Vector3(0f, 1.5f, 0f);
            _light.type = LightType.Point;
            _light.color = new Color(1f, 0.45f, 0.15f);
            _light.range = 6f;
            _light.shadows = LightShadows.None;

            _flameRoot = new GameObject($"Chamas do Curupira #{Unit.Id}").transform;
            _flameRoot.SetParent(transform.parent, false);
            _jet = ShapeFactory.Part(PrimitiveType.Capsule, _flameRoot, Vector3.zero, new Vector3(1.6f, 4.5f, 1.6f),
                MaterialFactory.Transparent(new Color(1f, 0.45f, 0.08f, 0.45f)), "Labareda").transform;
            VfxFactory.Fire(_jet, 0.4f, 80f, new Color(1f, 0.7f, 0.2f), new Color(1f, 0.2f, 0.02f));
            _jet.gameObject.SetActive(false);
        }

        private static Transform Leg(Transform parent, float x, Material skin)
        {
            var hip = new GameObject("Quadril").transform;
            hip.SetParent(parent, false);
            hip.localPosition = new Vector3(x, 0.92f, 0f);
            ShapeFactory.Part(PrimitiveType.Capsule, hip, new Vector3(0f, -0.45f, 0f), new Vector3(0.15f, 0.45f, 0.15f), skin, "Perna");
            // Pé voltado para trás: calcanhar à frente, dedos atrás.
            var foot = ShapeFactory.Part(PrimitiveType.Sphere, hip, new Vector3(0f, -0.88f, -0.12f), new Vector3(0.14f, 0.08f, 0.32f), skin, "Pé (virado para trás)").transform;
            for (int t = 0; t < 3; t++)
                ShapeFactory.Part(PrimitiveType.Sphere, foot, new Vector3((t - 1) * 0.3f, 0f, -0.5f), new Vector3(0.3f, 0.6f, 0.25f), skin, "Dedo");
            return hip;
        }

        private static Transform Arm(Transform parent, float side, Material skin)
        {
            var shoulder = new GameObject("Ombro").transform;
            shoulder.SetParent(parent, false);
            shoulder.localPosition = new Vector3(0.3f * side, 1.48f, 0f);
            ShapeFactory.Part(PrimitiveType.Capsule, shoulder, new Vector3(0f, -0.32f, 0f), new Vector3(0.12f, 0.32f, 0.12f), skin, "Braço");
            return shoulder;
        }

        private void OnDestroy()
        {
            if (_flameRoot != null) Destroy(_flameRoot.gameObject);
        }

        public override void OnBasicAttack()
        {
            base.OnBasicAttack();
            _punch = 1f;
        }

        public override void Sync(float dt)
        {
            base.Sync(dt);
            var kit = (Unit as Champion)?.Kit as CurupiraKit;
            if (kit == null) return;
            float heat01 = kit.Heat / CurupiraKit.MaxHeat;

            // Corrida: braços e pernas alternados; o tronco inclina com a velocidade.
            float speed = Unit.Velocity.Length;
            float swing = speed > 0.5f ? Mathf.Sin(AnimTime * (6f + speed)) * 40f : Mathf.Sin(AnimTime * 2f) * 3f;
            _legL.localRotation = Quaternion.Euler(swing, 0f, 0f);
            _legR.localRotation = Quaternion.Euler(-swing, 0f, 0f);
            if (_punch > 0f) _punch = Mathf.Max(0f, _punch - dt * 5f);
            _armL.localRotation = Quaternion.Euler(-swing, 0f, -8f);
            _armR.localRotation = Quaternion.Euler(swing - _punch * 100f, 0f, 8f);
            _body.localRotation = Quaternion.Euler(Mathf.Clamp(speed * 2f, 0f, 15f) + (kit.IsDashing ? 25f : 0f), 0f, 0f);
            _body.localPosition = new Vector3(0f, speed > 0.5f ? Mathf.Abs(Mathf.Sin(AnimTime * (6f + speed))) * 0.06f : 0f, 0f) + HitShake();

            // Domínio Térmico visível: brasas e cabelo mais intensos com Calor.
            MaterialFactory.SetEmission(_emberMat, new Color(1f, 0.4f, 0.05f) * Mathf.Lerp(0.8f, 4f, heat01));
            MaterialFactory.SetEmission(_hairMat, (kit.IsHot ? new Color(1f, 0.55f, 0.1f) : new Color(1f, 0.3f, 0.02f)) * Mathf.Lerp(1.5f, 4.5f, heat01));
            var hairEm = _hairFire.emission;
            hairEm.rateOverTime = 25f + heat01 * 60f;
            var trailEm = _trailFire.emission;
            trailEm.rateOverTime = speed > 0.5f || kit.IsDashing ? 30f + heat01 * 40f : 0f;
            _light.intensity = 1f + heat01 * 2.5f;

            SyncFlames(kit);
            SyncJet(kit);
        }

        private void SyncFlames(CurupiraKit kit)
        {
            var flames = kit.Flames;
            while (_flamePool.Count < flames.Count)
            {
                var f = ShapeFactory.Part(PrimitiveType.Sphere, _flameRoot, Vector3.zero, Vector3.one * 0.45f,
                    MaterialFactory.Emissive(new Color(1f, 0.5f, 0.1f), new Color(1f, 0.45f, 0.05f), 4f), "Chama").transform;
                VfxFactory.Fire(f, 0.15f, 40f, new Color(1f, 0.7f, 0.2f), new Color(1f, 0.25f, 0.02f));
                _flamePool.Add(f);
            }
            for (int i = 0; i < _flamePool.Count; i++)
            {
                bool on = i < flames.Count && flames[i].Alive;
                _flamePool[i].gameObject.SetActive(on);
                if (on) _flamePool[i].position = flames[i].Position.ToWorld(1.1f);
            }
        }

        private void SyncJet(CurupiraKit kit)
        {
            bool on = kit.WrathActive;
            _jet.gameObject.SetActive(on);
            if (!on) return;
            Vector3 origin = transform.position + Vector3.up * 0.8f;
            Vector3 dir = new Vector3(kit.JetDirection.X, 0f, kit.JetDirection.Y);
            _jet.position = origin + dir * 4.5f;
            _jet.rotation = Quaternion.LookRotation(dir) * Quaternion.Euler(90f, 0f, 0f);
            float flicker = 1f + Mathf.Sin(AnimTime * 40f) * 0.08f;
            _jet.localScale = new Vector3(1.6f * flicker, 4.5f, 1.6f * flicker);
        }
    }
}
