using UnityEngine;

namespace Lendas.Game
{
    /// <summary>Peças geométricas para montar os modelos procedurais desta versão de teste.</summary>
    public static class ShapeFactory
    {
        private static Mesh _cone;

        /// <summary>Cria uma primitiva sem colisor (a colisão é da simulação, não da física da Unity).</summary>
        public static GameObject Part(PrimitiveType type, Transform parent, Vector3 localPos, Vector3 localScale, Material mat, string name = null, Quaternion? rot = null)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name ?? type.ToString();
            var col = go.GetComponent<Collider>();
            if (col != null) Object.Destroy(col);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = localScale;
            go.transform.localRotation = rot ?? Quaternion.identity;
            go.GetComponent<Renderer>().sharedMaterial = mat;
            return go;
        }

        public static GameObject Cone(Transform parent, Vector3 localPos, Vector3 localScale, Material mat, string name = "Cone", Quaternion? rot = null)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = localScale;
            go.transform.localRotation = rot ?? Quaternion.identity;
            go.AddComponent<MeshFilter>().sharedMesh = ConeMesh();
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            return go;
        }

        /// <summary>Cone de altura 1 e raio da base 0,5 com a base em y = 0.</summary>
        public static Mesh ConeMesh()
        {
            if (_cone != null) return _cone;
            const int seg = 20;
            var verts = new Vector3[seg * 2 + 2];
            var tris = new int[seg * 6];
            for (int i = 0; i < seg; i++)
            {
                float a = i / (float)seg * Mathf.PI * 2f;
                var p = new Vector3(Mathf.Cos(a) * 0.5f, 0f, Mathf.Sin(a) * 0.5f);
                verts[i] = p;           // lateral
                verts[seg + i] = p;     // base
            }
            verts[seg * 2] = new Vector3(0f, 1f, 0f);
            verts[seg * 2 + 1] = Vector3.zero;
            int t = 0;
            for (int i = 0; i < seg; i++)
            {
                int n = (i + 1) % seg;
                tris[t++] = i; tris[t++] = seg * 2; tris[t++] = n;
                tris[t++] = seg + n; tris[t++] = seg * 2 + 1; tris[t++] = seg + i;
            }
            _cone = new Mesh { name = "Cone", vertices = verts, triangles = tris };
            _cone.RecalculateNormals();
            _cone.RecalculateBounds();
            return _cone;
        }

        /// <summary>Disco plano (áreas, indicadores) com raio 0,5.</summary>
        public static GameObject Disc(Transform parent, Vector3 localPos, float radius, Material mat, string name = "Disco")
        {
            var go = Part(PrimitiveType.Cylinder, parent, localPos, new Vector3(radius * 2f, 0.01f, radius * 2f), mat, name);
            go.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }
    }
}
