using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Lendas.Game
{
    /// <summary>
    /// Cria materiais em tempo de execução, compatíveis com URP (se configurado) e com o pipeline embutido.
    /// Todos os modelos desta versão de teste são procedurais: não há texturas ou malhas importadas.
    /// </summary>
    public static class MaterialFactory
    {
        private static readonly Dictionary<string, Material> Cache = new Dictionary<string, Material>();
        private static Texture2D _softDot;

        public static bool UsingUrp => GraphicsSettings.currentRenderPipeline != null;

        private static Shader LitShader()
        {
            Shader s = UsingUrp ? Shader.Find("Universal Render Pipeline/Lit") : Shader.Find("Standard");
            return s != null ? s : Shader.Find("Diffuse");
        }

        public static Material Lit(Color color, float smoothness = 0.25f, float metallic = 0f)
        {
            string key = $"lit_{ColorUtility.ToHtmlStringRGBA(color)}_{smoothness:0.00}_{metallic:0.00}";
            if (Cache.TryGetValue(key, out var m) && m != null) return m;
            m = new Material(LitShader()) { name = key };
            SetColor(m, color);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smoothness);
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            Cache[key] = m;
            return m;
        }

        /// <summary>Material emissivo (brasas, olhos, luzes espirituais). Instância própria para animar a emissão.</summary>
        public static Material Emissive(Color baseColor, Color emission, float intensity)
        {
            var m = new Material(LitShader()) { name = "emissive" };
            SetColor(m, baseColor);
            SetEmission(m, emission * intensity);
            return m;
        }

        public static void SetEmission(Material m, Color emission)
        {
            m.EnableKeyword("_EMISSION");
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", emission);
        }

        public static void SetColor(Material m, Color c)
        {
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        }

        /// <summary>Material transparente (água, áreas, indicadores).</summary>
        public static Material Transparent(Color color)
        {
            string key = $"tr_{ColorUtility.ToHtmlStringRGBA(color)}";
            if (Cache.TryGetValue(key, out var m) && m != null) return m;
            m = new Material(UnlitTransparentShader()) { name = key };
            m.mainTexture = Texture2D.whiteTexture;
            SetColor(m, color);
            ConfigureTransparency(m, false);
            Cache[key] = m;
            return m;
        }

        public static Material Particle(bool additive)
        {
            string key = additive ? "particle_add" : "particle_alpha";
            if (Cache.TryGetValue(key, out var m) && m != null) return m;
            Shader s = UsingUrp ? Shader.Find("Universal Render Pipeline/Particles/Unlit") : Shader.Find("Particles/Standard Unlit");
            if (s == null) s = Shader.Find("Sprites/Default");
            m = new Material(s) { name = key, mainTexture = SoftDot() };
            if (m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", SoftDot());
            ConfigureTransparency(m, additive);
            Cache[key] = m;
            return m;
        }

        private static Shader UnlitTransparentShader()
        {
            Shader s = UsingUrp ? Shader.Find("Universal Render Pipeline/Unlit") : Shader.Find("Unlit/Transparent");
            if (s == null) s = Shader.Find("Sprites/Default");
            return s;
        }

        private static void ConfigureTransparency(Material m, bool additive)
        {
            if (m.HasProperty("_Surface")) m.SetFloat("_Surface", 1f); // URP: transparente
            if (m.HasProperty("_Blend")) m.SetFloat("_Blend", additive ? 2f : 0f);
            if (m.HasProperty("_Mode")) m.SetFloat("_Mode", 2f);
            if (m.HasProperty("_ColorMode")) m.SetFloat("_ColorMode", 0f);
            m.SetOverrideTag("RenderType", "Transparent");
            if (m.HasProperty("_SrcBlend")) m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            if (m.HasProperty("_DstBlend")) m.SetFloat("_DstBlend", (float)(additive ? BlendMode.One : BlendMode.OneMinusSrcAlpha));
            if (m.HasProperty("_ZWrite")) m.SetFloat("_ZWrite", 0f);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            if (additive) m.EnableKeyword("_ALPHABLEND_ON");
            m.renderQueue = (int)RenderQueue.Transparent;
        }

        /// <summary>Textura procedural de ponto suave para partículas.</summary>
        public static Texture2D SoftDot()
        {
            if (_softDot != null) return _softDot;
            const int size = 64;
            _softDot = new Texture2D(size, size, TextureFormat.RGBA32, false) { name = "SoftDot", wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size * 2f - 1f, dy = (y + 0.5f) / size * 2f - 1f;
                    float a = Mathf.Clamp01(1f - Mathf.Sqrt(dx * dx + dy * dy));
                    _softDot.SetPixel(x, y, new Color(1f, 1f, 1f, a * a));
                }
            _softDot.Apply();
            return _softDot;
        }
    }
}
