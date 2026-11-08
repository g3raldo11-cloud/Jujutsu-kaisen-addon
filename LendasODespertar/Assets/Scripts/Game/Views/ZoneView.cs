using Lendas.Core;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>Apresentação de zonas: Rastro de Fogo, Reino dos Redemoinhos, âncoras e Tempestade de Brasas.</summary>
    public sealed class ZoneView : MonoBehaviour
    {
        public Zone Zone { get; private set; }
        private GameObject _disc;
        private ParticleSystem _fx;

        public void Bind(Zone z)
        {
            Zone = z;
            name = $"Zona {z.Kind} #{z.Id}";
            transform.position = z.Position.ToWorld();
            switch (z.Kind)
            {
                case ZoneKind.RastroDeFogo:
                    _disc = ShapeFactory.Disc(transform, new Vector3(0f, 0.02f, 0f), z.Radius, MaterialFactory.Transparent(new Color(1f, 0.3f, 0.02f, 0.35f)), "Brasas");
                    _fx = VfxFactory.Fire(transform, z.Radius * 0.7f, 30f, new Color(1f, 0.65f, 0.1f), new Color(1f, 0.2f, 0.02f));
                    break;
                case ZoneKind.ReinoDosRedemoinhos:
                    _disc = ShapeFactory.Disc(transform, new Vector3(0f, 0.03f, 0f), z.Radius, MaterialFactory.Transparent(new Color(0.75f, 0.9f, 1f, 0.18f)), "Reino");
                    _fx = VfxFactory.Swirl(transform, z.Radius * 0.9f, 0.8f, new Color(0.9f, 0.95f, 1f, 0.7f), 160f);
                    break;
                case ZoneKind.RedemoinhoAncora:
                    _fx = VfxFactory.Swirl(transform, 0.5f, 2.6f, new Color(0.72f, 0.6f, 0.42f, 0.8f), 70f);
                    _disc = ShapeFactory.Disc(transform, new Vector3(0f, 0.02f, 0f), 0.6f, MaterialFactory.Transparent(new Color(0.6f, 0.5f, 0.35f, 0.4f)), "Âncora");
                    break;
                case ZoneKind.TempestadeDeBrasas:
                    _fx = VfxFactory.Swirl(transform, z.Radius * 0.6f, 4f, new Color(1f, 0.45f, 0.08f, 0.9f), 260f);
                    _disc = ShapeFactory.Disc(transform, new Vector3(0f, 0.02f, 0f), z.Radius, MaterialFactory.Transparent(new Color(1f, 0.35f, 0.05f, 0.3f)), "Tempestade");
                    VfxFactory.Fire(transform, z.Radius * 0.5f, 60f, new Color(1f, 0.7f, 0.2f), new Color(1f, 0.25f, 0.05f));
                    break;
            }
        }

        public void Sync(float dt)
        {
            if (Zone == null) return;
            transform.position = Vector3.Lerp(transform.position, Zone.Position.ToWorld(), 1f - Mathf.Exp(-dt * 20f));
            float fade = Mathf.Clamp01(Zone.Remaining / 0.5f);
            if (_disc != null) _disc.transform.localScale = new Vector3(Zone.Radius * 2f * (0.6f + 0.4f * fade), 0.01f, Zone.Radius * 2f * (0.6f + 0.4f * fade));
            if (_fx != null && Zone.Remaining < 0.4f && _fx.isPlaying) _fx.Stop();
        }
    }
}
