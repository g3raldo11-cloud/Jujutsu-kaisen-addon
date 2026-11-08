using System.Collections.Generic;
using UnityEngine;

namespace Lendas.Game
{
    public enum Sfx { Golpe, Erro, Vento, Fogo, Troca, Salto, Esquiva, Suprema, Ofuscar, Investida, Sinergia, Impacto }

    /// <summary>
    /// Sons sintetizados proceduralmente (sem arquivos de áudio de terceiros) e tocados em 3D
    /// a partir de um pool de AudioSources. Versão de teste: timbres simples, mas distintos por ação.
    /// </summary>
    public static class SoundBank
    {
        private const int Rate = 22050;
        private static readonly Dictionary<Sfx, AudioClip> Clips = new Dictionary<Sfx, AudioClip>();
        private static readonly List<AudioSource> Pool = new List<AudioSource>();
        private static Transform _root;
        private static uint _noise = 2463534242u;
        public static float Volume = 0.6f;

        private static float Noise()
        {
            _noise ^= _noise << 13; _noise ^= _noise >> 17; _noise ^= _noise << 5;
            return (_noise & 0xFFFF) / 32768f - 1f;
        }

        public static AudioClip Get(Sfx s)
        {
            if (Clips.TryGetValue(s, out var c) && c != null) return c;
            c = Synthesize(s);
            Clips[s] = c;
            return c;
        }

        private static AudioClip Synthesize(Sfx s)
        {
            float dur;
            switch (s)
            {
                case Sfx.Vento: case Sfx.Fogo: dur = 0.7f; break;
                case Sfx.Suprema: case Sfx.Sinergia: dur = 1.2f; break;
                case Sfx.Troca: case Sfx.Ofuscar: case Sfx.Investida: dur = 0.45f; break;
                default: dur = 0.18f; break;
            }
            int n = (int)(dur * Rate);
            var data = new float[n];
            float lp = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                float k = t / dur;
                float env = Mathf.Clamp01(t * 60f) * (1f - k) * (1f - k);
                float v;
                switch (s)
                {
                    case Sfx.Golpe:      // pancada seca
                        v = Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(180f, 60f, k) * t) * 0.8f + Noise() * 0.3f * (1f - k); break;
                    case Sfx.Impacto:
                        v = Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(120f, 45f, k) * t) + Noise() * 0.2f; break;
                    case Sfx.Erro:       // golpe no vazio
                        lp += (Noise() - lp) * 0.08f; v = lp * 2.5f; break;
                    case Sfx.Vento:      // ruído filtrado com varredura
                        lp += (Noise() - lp) * Mathf.Lerp(0.02f, 0.12f, Mathf.Sin(k * Mathf.PI)); v = lp * 3f; env = Mathf.Sin(k * Mathf.PI); break;
                    case Sfx.Fogo:       // crepitar
                        lp += (Noise() - lp) * 0.3f; v = lp * (Noise() > 0.92f ? 2.5f : 0.6f); env = Mathf.Sin(k * Mathf.PI); break;
                    case Sfx.Troca:      // "plim" travesso ascendente
                        v = Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(500f, 1300f, k) * t) * 0.6f; break;
                    case Sfx.Salto:
                        v = Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(220f, 440f, k) * t) * 0.5f; break;
                    case Sfx.Esquiva:
                        lp += (Noise() - lp) * 0.25f; v = lp * 2f; break;
                    case Sfx.Ofuscar:    // brilho agudo
                        v = (Mathf.Sin(2f * Mathf.PI * 1760f * t) + Mathf.Sin(2f * Mathf.PI * 2217f * t)) * 0.3f; break;
                    case Sfx.Investida:
                        lp += (Noise() - lp) * 0.15f; v = lp * 2f + Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(90f, 50f, k) * t) * 0.6f; break;
                    case Sfx.Sinergia:   // acorde (inspirado em berimbau: corda + cabaça)
                        v = (Mathf.Sin(2f * Mathf.PI * 196f * t) + Mathf.Sin(2f * Mathf.PI * 247f * t) * 0.7f + Mathf.Sin(2f * Mathf.PI * 294f * t) * 0.5f) * 0.4f
                            * (1f + 0.3f * Mathf.Sin(2f * Mathf.PI * 5f * t)); break;
                    case Sfx.Suprema:
                    default:
                        v = Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(80f, 160f, k) * t) * 0.7f + Noise() * 0.25f * env; break;
                }
                data[i] = v * env * 0.6f;
            }
            var clip = AudioClip.Create(s.ToString(), n, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        public static void Play(Sfx s, Vector3 position, float volume = 1f, float pitch = 1f)
        {
            if (_root == null) { _root = new GameObject("Audio3D").transform; Pool.Clear(); }
            AudioSource src = null;
            foreach (var a in Pool) if (a != null && !a.isPlaying) { src = a; break; }
            if (src == null)
            {
                if (Pool.Count >= 16) return; // limite de vozes simultâneas
                var go = new GameObject("Fonte");
                go.transform.SetParent(_root, false);
                src = go.AddComponent<AudioSource>();
                src.spatialBlend = 1f; // áudio espacial 3D
                src.rolloffMode = AudioRolloffMode.Linear;
                src.minDistance = 2f;
                src.maxDistance = 40f;
                src.playOnAwake = false;
                Pool.Add(src);
            }
            src.transform.position = position;
            src.clip = Get(s);
            src.volume = volume * Volume;
            src.pitch = pitch;
            src.Play();
        }
    }
}
