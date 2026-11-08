using UnityEngine;

namespace Lendas.Game
{
    /// <summary>Câmera em terceira pessoa com distância (roda do mouse) e sensibilidade ajustáveis.</summary>
    public sealed class ThirdPersonCamera : MonoBehaviour
    {
        public Transform Target;
        public float Distance = 9f;
        public float MinDistance = 4f;
        public float MaxDistance = 18f;
        public float Sensitivity = 3f;
        public float Yaw = 90f;
        public float Pitch = 35f;
        public float Height = 1.4f;
        public bool CursorLocked { get; private set; }

        private void Start() => SetCursorLock(true);

        public void SetCursorLock(bool locked)
        {
            CursorLocked = locked;
            Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !locked;
        }

        private void LateUpdate()
        {
            if (ArenaInput.Down(ArenaInput.Key.Esc)) SetCursorLock(!CursorLocked);
            if (!CursorLocked && ArenaInput.MouseDown(0) && GUIUtility.hotControl == 0 && Input2Gui.MouseNotOverPanel()) SetCursorLock(true);

            if (CursorLocked)
            {
                Vector2 d = ArenaInput.MouseDelta();
                Yaw += d.x * Sensitivity;
                Pitch = Mathf.Clamp(Pitch - d.y * Sensitivity, 10f, 70f);
            }
            Distance = Mathf.Clamp(Distance - ArenaInput.Scroll() * 1.2f, MinDistance, MaxDistance);
            if (Target == null) return;
            Quaternion rot = Quaternion.Euler(Pitch, Yaw, 0f);
            Vector3 focus = Target.position + Vector3.up * Height;
            transform.position = focus - rot * Vector3.forward * Distance;
            transform.rotation = rot;
        }

        /// <summary>Ponto mirado: centro da tela projetado no chão (y = 0).</summary>
        public Vector3 AimPoint(float maxRange)
        {
            var ray = new Ray(transform.position, transform.forward);
            Vector3 origin = Target != null ? Target.position : Vector3.zero;
            Vector3 hit;
            if (Mathf.Abs(ray.direction.y) > 1e-3f && ray.direction.y < 0f)
                hit = ray.origin + ray.direction * (-ray.origin.y / ray.direction.y);
            else
                hit = origin + new Vector3(transform.forward.x, 0f, transform.forward.z).normalized * maxRange;
            Vector3 flat = hit - origin;
            flat.y = 0f;
            // Mira mínima à frente do personagem, para não mirar atrás da câmera.
            Vector3 fwd = new Vector3(transform.forward.x, 0f, transform.forward.z).normalized;
            if (Vector3.Dot(flat, fwd) < 1.5f) flat = fwd * 1.5f + (flat - fwd * Vector3.Dot(flat, fwd));
            return origin + Vector3.ClampMagnitude(flat, maxRange);
        }

        /// <summary>Converte WASD em direção no mundo relativa à câmera.</summary>
        public Vector3 MoveDirection(Vector2 axes)
        {
            Vector3 fwd = new Vector3(transform.forward.x, 0f, transform.forward.z).normalized;
            Vector3 right = new Vector3(transform.right.x, 0f, transform.right.z).normalized;
            return Vector3.ClampMagnitude(fwd * axes.y + right * axes.x, 1f);
        }
    }

    /// <summary>Ajuda para não travar o cursor ao clicar no painel da interface.</summary>
    public static class Input2Gui
    {
        public static Rect PanelRect;
        public static bool MouseNotOverPanel()
        {
            Vector2 m = UnityEngine.Input.mousePosition;
            m.y = Screen.height - m.y;
            return !PanelRect.Contains(m);
        }
    }
}
