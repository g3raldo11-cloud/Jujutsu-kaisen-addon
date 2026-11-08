using Lendas.Core;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>
    /// Monta a Arena de Teste a partir do <see cref="MapLayout"/>: chão de terra batida com grade de medição,
    /// muretas de pedra nas bordas, uma poça d'água e uma moita (terrenos que a simulação reconhece),
    /// iluminação de fim de tarde e neblina leve.
    /// </summary>
    public static class ArenaBuilder
    {
        public static Transform Build(MapLayout map)
        {
            var root = new GameObject("Arena de Teste").transform;
            Vector3 size = new Vector3(map.Max.X - map.Min.X, 0f, map.Max.Y - map.Min.Y);
            Vector3 center = new Vector3((map.Max.X + map.Min.X) * 0.5f, 0f, (map.Max.Y + map.Min.Y) * 0.5f);

            // Chão.
            var ground = ShapeFactory.Part(PrimitiveType.Cube, root, center + Vector3.down * 0.5f, new Vector3(size.x + 6f, 1f, size.z + 6f),
                MaterialFactory.Lit(new Color(0.47f, 0.33f, 0.22f), 0.1f), "Chão");
            ground.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            // Grade de medição a cada 2 m (para avaliar alcance das habilidades).
            var gridMat = MaterialFactory.Transparent(new Color(1f, 0.92f, 0.75f, 0.12f));
            for (float x = map.Min.X; x <= map.Max.X + 0.01f; x += 2f)
                ShapeFactory.Part(PrimitiveType.Cube, root, new Vector3(x, 0.005f, center.z), new Vector3(0.04f, 0.01f, size.z), gridMat, "Grade");
            for (float z = map.Min.Y; z <= map.Max.Y + 0.01f; z += 2f)
                ShapeFactory.Part(PrimitiveType.Cube, root, new Vector3(center.x, 0.005f, z), new Vector3(size.x, 0.01f, 0.04f), gridMat, "Grade");

            // Muretas de pedra nas bordas (a simulação limita a arena pelos limites do mapa).
            var stone = MaterialFactory.Lit(new Color(0.45f, 0.43f, 0.4f), 0.15f);
            ShapeFactory.Part(PrimitiveType.Cube, root, new Vector3(center.x, 0.5f, map.Max.Y + 0.5f), new Vector3(size.x + 2f, 1f, 1f), stone, "Mureta Norte");
            ShapeFactory.Part(PrimitiveType.Cube, root, new Vector3(center.x, 0.5f, map.Min.Y - 0.5f), new Vector3(size.x + 2f, 1f, 1f), stone, "Mureta Sul");
            ShapeFactory.Part(PrimitiveType.Cube, root, new Vector3(map.Max.X + 0.5f, 0.5f, center.z), new Vector3(1f, 1f, size.z), stone, "Mureta Leste");
            ShapeFactory.Part(PrimitiveType.Cube, root, new Vector3(map.Min.X - 0.5f, 0.5f, center.z), new Vector3(1f, 1f, size.z), stone, "Mureta Oeste");

            // Terrenos.
            foreach (var a in map.Areas)
            {
                if (a.IsBox) continue;
                if (a.Kind == TerrainKind.Agua)
                    ShapeFactory.Disc(root, a.Center.ToWorld(0.02f), a.Radius, MaterialFactory.Transparent(new Color(0.15f, 0.45f, 0.55f, 0.75f)), a.Name);
                else if (a.Kind == TerrainKind.Vegetacao)
                    BuildBush(root, a);
            }

            // Obstáculos (a arena padrão não tem, mas o construtor aceita mapas com eles).
            foreach (var o in map.Obstacles)
            {
                var mat = MaterialFactory.Lit(new Color(0.35f, 0.3f, 0.25f), 0.2f);
                if (o.IsBox) ShapeFactory.Part(PrimitiveType.Cube, root, o.Center.ToWorld(1f), new Vector3(o.HalfExtents.X * 2f, 2f, o.HalfExtents.Y * 2f), mat, o.Name);
                else ShapeFactory.Part(PrimitiveType.Cylinder, root, o.Center.ToWorld(1.5f), new Vector3(o.Radius * 2f, 1.5f, o.Radius * 2f), mat, o.Name);
            }

            // Luz e atmosfera.
            var sun = new GameObject("Sol").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.86f, 0.68f);
            sun.intensity = 1.1f;
            sun.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(38f, -35f, 0f);
            sun.transform.SetParent(root, true);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.55f, 0.6f, 0.75f);
            RenderSettings.ambientEquatorColor = new Color(0.5f, 0.42f, 0.35f);
            RenderSettings.ambientGroundColor = new Color(0.25f, 0.18f, 0.12f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.62f, 0.55f, 0.5f);
            RenderSettings.fogStartDistance = 30f;
            RenderSettings.fogEndDistance = 90f;
            return root;
        }

        private static void BuildBush(Transform root, TerrainArea a)
        {
            var leaf = MaterialFactory.Lit(new Color(0.2f, 0.42f, 0.16f), 0.1f);
            var leaf2 = MaterialFactory.Lit(new Color(0.28f, 0.5f, 0.2f), 0.1f);
            var rng = new System.Random(a.Center.GetHashCode());
            for (int i = 0; i < 26; i++)
            {
                float ang = (float)rng.NextDouble() * Mathf.PI * 2f;
                float r = Mathf.Sqrt((float)rng.NextDouble()) * a.Radius * 0.9f;
                var p = a.Center.ToWorld() + new Vector3(Mathf.Cos(ang) * r, 0f, Mathf.Sin(ang) * r);
                float h = 0.6f + (float)rng.NextDouble() * 0.8f;
                ShapeFactory.Cone(root, p, new Vector3(0.5f, h * 1.6f, 0.5f), i % 2 == 0 ? leaf : leaf2, "Capim",
                    Quaternion.Euler((float)rng.NextDouble() * 20f - 10f, 0f, (float)rng.NextDouble() * 20f - 10f));
            }
        }
    }
}
