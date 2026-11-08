using Lendas.Core;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>Indicador de alcance no chão enquanto a tecla da habilidade está pressionada.</summary>
    public sealed class RangeIndicator : MonoBehaviour
    {
        private LineRenderer _line;
        private LineRenderer _target;
        private const int Segments = 48;

        private void Awake()
        {
            _line = MakeLine("Alcance", new Color(1f, 0.85f, 0.4f, 0.9f));
            _target = MakeLine("Alvo", new Color(1f, 0.5f, 0.2f, 0.9f));
            Hide();
        }

        private LineRenderer MakeLine(string n, Color c)
        {
            var go = new GameObject(n);
            go.transform.SetParent(transform, false);
            var lr = go.AddComponent<LineRenderer>();
            lr.useWorldSpace = true;
            lr.widthMultiplier = 0.08f;
            lr.sharedMaterial = MaterialFactory.Transparent(c);
            lr.startColor = lr.endColor = c;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return lr;
        }

        public void Hide()
        {
            _line.enabled = false;
            _target.enabled = false;
        }

        public void Show(AbilityDef def, Vector3 origin, Vector3 aim)
        {
            if (def == null) { Hide(); return; }
            Vector3 dir = aim - origin; dir.y = 0f;
            if (dir.sqrMagnitude < 1e-4f) dir = Vector3.forward;
            dir.Normalize();
            origin.y = 0.06f;
            float range = def.Range > 0f ? def.Range : def.Area;
            switch (def.Indicator)
            {
                case IndicatorShape.Circulo:
                    Circle(_line, origin, def.Area > 0f ? def.Area : range);
                    _target.enabled = false;
                    break;
                case IndicatorShape.Cone:
                {
                    float half = def.ConeAngleDeg * 0.5f;
                    _line.enabled = true;
                    _line.loop = true;
                    _line.positionCount = Segments + 2;
                    _line.SetPosition(0, origin);
                    for (int i = 0; i <= Segments; i++)
                    {
                        float a = Mathf.Lerp(-half, half, i / (float)Segments);
                        _line.SetPosition(i + 1, origin + Quaternion.Euler(0f, a, 0f) * dir * range);
                    }
                    _target.enabled = false;
                    break;
                }
                case IndicatorShape.Linha:
                {
                    _line.enabled = true;
                    _line.loop = true;
                    float w = Mathf.Max(0.6f, def.Area);
                    Vector3 side = Vector3.Cross(Vector3.up, dir) * w;
                    _line.positionCount = 4;
                    _line.SetPosition(0, origin + side);
                    _line.SetPosition(1, origin + side + dir * range);
                    _line.SetPosition(2, origin - side + dir * range);
                    _line.SetPosition(3, origin - side);
                    _target.enabled = false;
                    break;
                }
                case IndicatorShape.AreaNoAlvo:
                {
                    Circle(_line, origin, range);
                    Vector3 flat = aim - origin; flat.y = 0f;
                    Vector3 p = origin + Vector3.ClampMagnitude(flat, range);
                    Circle(_target, p, def.Area);
                    break;
                }
                default:
                    Circle(_line, origin, 1.2f);
                    _target.enabled = false;
                    break;
            }
        }

        private static void Circle(LineRenderer lr, Vector3 c, float r)
        {
            lr.enabled = true;
            lr.loop = true;
            lr.positionCount = Segments;
            for (int i = 0; i < Segments; i++)
            {
                float a = i / (float)Segments * Mathf.PI * 2f;
                lr.SetPosition(i, c + new Vector3(Mathf.Cos(a) * r, 0f, Mathf.Sin(a) * r));
            }
        }
    }
}
