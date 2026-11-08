using System.Collections.Generic;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>
    /// Efeitos de partículas procedurais com pool (evita alocação durante o combate)
    /// e limite de efeitos simultâneos para manter o desempenho.
    /// </summary>
    public static class VfxFactory
    {
        public const int MaxBursts = 24;
        private static readonly Queue<ParticleSystem> BurstPool = new Queue<ParticleSystem>();
        private static readonly List<ParticleSystem> ActiveBursts = new List<ParticleSystem>();
        private static Transform _root;

        private static Transform Root
        {
            get
            {
                if (_root == null) _root = new GameObject("VFX").transform;
                return _root;
            }
        }

        public static ParticleSystem Create(string name, Transform parent, bool additive)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = MaterialFactory.Particle(additive);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var main = ps.main;
            main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 200;
            return ps;
        }

        /// <summary>Chamas contínuas (corpo do Boitatá, rastro de fogo).</summary>
        public static ParticleSystem Fire(Transform parent, float radius, float rate, Color a, Color b)
        {
            var ps = Create("Fogo", parent, true);
            var main = ps.main;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.35f, 0.8f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.4f, 1.6f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.25f, 0.6f);
            main.startColor = new ParticleSystem.MinMaxGradient(a, b);
            main.gravityModifier = -0.25f;
            main.loop = true;
            var em = ps.emission;
            em.rateOverTime = rate;
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = radius;
            var col = ps.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(new Color(1f, 0.3f, 0.05f), 1f) },
                      new[] { new GradientAlphaKey(0.9f, 0f), new GradientAlphaKey(0f, 1f) });
            col.color = g;
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 1f, 1f, 0.2f));
            ps.Play();
            return ps;
        }

        /// <summary>Redemoinho de poeira e folhas (Saci).</summary>
        public static ParticleSystem Swirl(Transform parent, float radius, float height, Color color, float rate = 60f)
        {
            var ps = Create("Redemoinho", parent, false);
            var main = ps.main;
            main.simulationSpace = ParticleSystemSimulationSpace.Local;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.6f, 1.1f);
            main.startSpeed = 0f;
            main.startSize = new ParticleSystem.MinMaxCurve(0.08f, 0.25f);
            main.startColor = color;
            main.loop = true;
            var em = ps.emission;
            em.rateOverTime = rate;
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Circle;
            shape.radius = radius;
            shape.rotation = new Vector3(90f, 0f, 0f);
            var vel = ps.velocityOverLifetime;
            vel.enabled = true;
            vel.space = ParticleSystemSimulationSpace.Local;
            vel.orbitalY = new ParticleSystem.MinMaxCurve(7f);
            vel.y = new ParticleSystem.MinMaxCurve(height);
            vel.radial = new ParticleSystem.MinMaxCurve(0.15f);
            var col = ps.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                      new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(0.8f, 0.2f), new GradientAlphaKey(0f, 1f) });
            col.color = g;
            ps.Play();
            return ps;
        }

        /// <summary>Explosão curta reutilizável (impactos, coleta, troca de lugar).</summary>
        public static void Burst(Vector3 position, Color color, int count = 18, float speed = 4f, float size = 0.25f)
        {
            for (int i = ActiveBursts.Count - 1; i >= 0; i--)
            {
                var a = ActiveBursts[i];
                if (a == null) { ActiveBursts.RemoveAt(i); continue; }
                if (!a.IsAlive(true)) { ActiveBursts.RemoveAt(i); a.gameObject.SetActive(false); BurstPool.Enqueue(a); }
            }
            if (ActiveBursts.Count >= MaxBursts) return; // limite de efeitos simultâneos

            ParticleSystem ps = null;
            while (BurstPool.Count > 0 && ps == null) ps = BurstPool.Dequeue();
            if (ps == null)
            {
                ps = Create("Impacto", Root, true);
                var m = ps.main;
                m.loop = false;
                m.startLifetime = new ParticleSystem.MinMaxCurve(0.25f, 0.55f);
                var em = ps.emission;
                em.rateOverTime = 0f;
                var shape = ps.shape;
                shape.shapeType = ParticleSystemShapeType.Sphere;
                shape.radius = 0.2f;
                var col = ps.colorOverLifetime;
                col.enabled = true;
                var g = new Gradient();
                g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                          new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0f, 1f) });
                col.color = g;
            }
            ps.gameObject.SetActive(true);
            ps.transform.position = position;
            var main = ps.main;
            main.startColor = color;
            main.startSpeed = new ParticleSystem.MinMaxCurve(speed * 0.4f, speed);
            main.startSize = new ParticleSystem.MinMaxCurve(size * 0.5f, size);
            ps.Clear();
            ps.Emit(count);
            ActiveBursts.Add(ps);
        }

        public static void Reset()
        {
            BurstPool.Clear();
            ActiveBursts.Clear();
            if (_root != null) Object.Destroy(_root.gameObject);
            _root = null;
        }
    }
}
