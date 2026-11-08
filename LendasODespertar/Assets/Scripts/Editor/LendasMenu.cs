using System;
using System.IO;
using System.Linq;
using Lendas.Game;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Lendas.EditorTools
{
    /// <summary>Menu "Lendas" no Editor: cria a cena da Arena de Teste e prepara o projeto.</summary>
    public static class LendasMenu
    {
        private const string ScenePath = "Assets/Scenes/ArenaDeTeste.unity";

        [MenuItem("Lendas/Criar cena da Arena de Teste", priority = 1)]
        public static void CreateArenaScene()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            new GameObject("Arena de Teste (ArenaGame)").AddComponent<ArenaGame>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            AddSceneToBuild(ScenePath);
            IncludeRuntimeShaders();
            Debug.Log("[Lendas] Cena criada em " + ScenePath + ". Aperte Play para testar.");
        }

        [MenuItem("Lendas/Abrir Arena de Teste e dar Play", priority = 2)]
        public static void PlayArena()
        {
            if (!File.Exists(ScenePath)) CreateArenaScene();
            else if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) EditorSceneManager.OpenScene(ScenePath);
            EditorApplication.isPlaying = true;
        }

        private static void AddSceneToBuild(string path)
        {
            var scenes = EditorBuildSettings.scenes.ToList();
            if (scenes.Any(s => s.path == path)) return;
            scenes.Insert(0, new EditorBuildSettingsScene(path, true));
            EditorBuildSettings.scenes = scenes.ToArray();
        }

        /// <summary>
        /// Os materiais são criados em tempo de execução com Shader.Find; para que funcionem numa build,
        /// os shaders precisam estar na lista "Always Included Shaders".
        /// </summary>
        [MenuItem("Lendas/Incluir shaders usados em tempo de execução", priority = 20)]
        public static void IncludeRuntimeShaders()
        {
            string[] names =
            {
                "Standard", "Particles/Standard Unlit", "Unlit/Transparent", "Sprites/Default",
                "Universal Render Pipeline/Lit", "Universal Render Pipeline/Unlit", "Universal Render Pipeline/Particles/Unlit",
            };
            var settings = AssetDatabase.LoadAssetAtPath<GraphicsSettings>("ProjectSettings/GraphicsSettings.asset");
            if (settings == null) { Debug.LogWarning("[Lendas] GraphicsSettings não encontrado."); return; }
            var so = new SerializedObject(settings);
            var list = so.FindProperty("m_AlwaysIncludedShaders");
            foreach (var n in names)
            {
                var shader = Shader.Find(n);
                if (shader == null) continue;
                bool present = false;
                for (int i = 0; i < list.arraySize; i++)
                    if (list.GetArrayElementAtIndex(i).objectReferenceValue == shader) { present = true; break; }
                if (present) continue;
                list.InsertArrayElementAtIndex(list.arraySize);
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = shader;
            }
            so.ApplyModifiedProperties();
            AssetDatabase.SaveAssets();
        }

        /// <summary>
        /// Cria e ativa um URP Asset (renderização inicial recomendada). Usa reflexão para não exigir
        /// referência de compilação ao pacote: se o pacote URP não estiver instalado, apenas avisa.
        /// Os materiais da arena funcionam tanto no pipeline embutido quanto no URP.
        /// </summary>
        [MenuItem("Lendas/Configurar URP (opcional)", priority = 21)]
        public static void SetupUrp()
        {
            var assetType = Type.GetType("UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset, Unity.RenderPipelines.Universal.Runtime");
            if (assetType == null) { Debug.LogWarning("[Lendas] Pacote URP (com.unity.render-pipelines.universal) não instalado."); return; }
            var create = assetType.GetMethods().FirstOrDefault(m => m.Name == "Create" && m.IsStatic);
            if (create == null) { Debug.LogWarning("[Lendas] API do URP não reconhecida."); return; }
            var args = create.GetParameters().Select(p => p.HasDefaultValue ? p.DefaultValue : null).ToArray();
            var asset = create.Invoke(null, args) as RenderPipelineAsset;
            if (asset == null) return;
            Directory.CreateDirectory("Assets/Settings");
            AssetDatabase.CreateAsset(asset, "Assets/Settings/Lendas_URP.asset");
            GraphicsSettings.defaultRenderPipeline = asset;
            QualitySettings.renderPipeline = asset;
            AssetDatabase.SaveAssets();
            IncludeRuntimeShaders();
            Debug.Log("[Lendas] URP configurado (Assets/Settings/Lendas_URP.asset).");
        }
    }
}
