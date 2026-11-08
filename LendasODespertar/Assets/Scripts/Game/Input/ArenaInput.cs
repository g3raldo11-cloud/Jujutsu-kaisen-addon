using Lendas.Core;
using UnityEngine;
#if LENDAS_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
using UnityEngine.InputSystem;
#endif

namespace Lendas.Game
{
    /// <summary>
    /// Lê teclado e mouse e monta o <see cref="PlayerCommand"/> enviado à simulação.
    /// Habilidades: segurar mostra o indicador de alcance; soltar conjura (reconjurar = apertar de novo).
    /// Funciona com o Input Manager antigo e com o Input System novo.
    /// </summary>
    public sealed class ArenaInput
    {
        public enum Key { W, A, S, D, Q, E, F, R, Space, Shift, Ctrl, Tab, Esc, Alpha1, Alpha2, Alpha3, M, Backspace, H }

        private CommandButtons _pending;
        public AbilitySlot? Previewing { get; private set; }
        public bool AttackHeld { get; private set; }
        public bool SprintHeld { get; private set; }
        public Vector2 MoveAxes { get; private set; }

        private static readonly (Key key, AbilitySlot slot)[] AbilityKeys =
        {
            (Key.Q, AbilitySlot.Habilidade1), (Key.E, AbilitySlot.Habilidade2), (Key.F, AbilitySlot.Habilidade3), (Key.R, AbilitySlot.Suprema),
        };

        /// <summary>Chamado a cada quadro: acumula apertos até o próximo tick da simulação.</summary>
        public void Poll()
        {
            float x = (Held(Key.D) ? 1f : 0f) - (Held(Key.A) ? 1f : 0f);
            float y = (Held(Key.W) ? 1f : 0f) - (Held(Key.S) ? 1f : 0f);
            MoveAxes = new Vector2(x, y);
            AttackHeld = MouseHeld(0);
            SprintHeld = Held(Key.Shift);

            Previewing = null;
            foreach (var (key, slot) in AbilityKeys)
            {
                if (Held(key)) Previewing = slot;
                if (Up(key)) _pending |= PlayerCommand.ButtonFor(slot);
            }
            if (Down(Key.Space)) _pending |= CommandButtons.Salto;
            if (Down(Key.Ctrl) || MouseDown(1)) _pending |= CommandButtons.Esquiva;
        }

        public PlayerCommand Build(Vec2 moveWorld, Vec2 aim)
        {
            var cmd = new PlayerCommand
            {
                Move = moveWorld,
                AimPoint = aim,
                Attack = AttackHeld,
                Sprint = SprintHeld,
                Pressed = _pending,
            };
            _pending = CommandButtons.None;
            return cmd;
        }

#if LENDAS_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
        private static UnityEngine.InputSystem.Controls.KeyControl Map(Key k)
        {
            var kb = Keyboard.current;
            if (kb == null) return null;
            switch (k)
            {
                case Key.W: return kb.wKey; case Key.A: return kb.aKey; case Key.S: return kb.sKey; case Key.D: return kb.dKey;
                case Key.Q: return kb.qKey; case Key.E: return kb.eKey; case Key.F: return kb.fKey; case Key.R: return kb.rKey;
                case Key.Space: return kb.spaceKey; case Key.Shift: return kb.leftShiftKey; case Key.Ctrl: return kb.leftCtrlKey;
                case Key.Tab: return kb.tabKey; case Key.Esc: return kb.escapeKey; case Key.M: return kb.mKey; case Key.H: return kb.hKey;
                case Key.Alpha1: return kb.digit1Key; case Key.Alpha2: return kb.digit2Key; case Key.Alpha3: return kb.digit3Key;
                case Key.Backspace: return kb.backspaceKey;
            }
            return null;
        }
        public static bool Held(Key k) => Map(k)?.isPressed ?? false;
        public static bool Down(Key k) => Map(k)?.wasPressedThisFrame ?? false;
        public static bool Up(Key k) => Map(k)?.wasReleasedThisFrame ?? false;
        private static UnityEngine.InputSystem.Controls.ButtonControl Btn(int b)
        {
            var m = Mouse.current; if (m == null) return null;
            return b == 0 ? m.leftButton : (b == 1 ? m.rightButton : m.middleButton);
        }
        public static bool MouseHeld(int b) => Btn(b)?.isPressed ?? false;
        public static bool MouseDown(int b) => Btn(b)?.wasPressedThisFrame ?? false;
        public static Vector2 MouseDelta() => Mouse.current != null ? Mouse.current.delta.ReadValue() * 0.05f : Vector2.zero;
        public static float Scroll() => Mouse.current != null ? Mouse.current.scroll.ReadValue().y / 120f : 0f;
#else
        private static KeyCode Map(Key k)
        {
            switch (k)
            {
                case Key.W: return KeyCode.W; case Key.A: return KeyCode.A; case Key.S: return KeyCode.S; case Key.D: return KeyCode.D;
                case Key.Q: return KeyCode.Q; case Key.E: return KeyCode.E; case Key.F: return KeyCode.F; case Key.R: return KeyCode.R;
                case Key.Space: return KeyCode.Space; case Key.Shift: return KeyCode.LeftShift; case Key.Ctrl: return KeyCode.LeftControl;
                case Key.Tab: return KeyCode.Tab; case Key.Esc: return KeyCode.Escape; case Key.M: return KeyCode.M; case Key.H: return KeyCode.H;
                case Key.Alpha1: return KeyCode.Alpha1; case Key.Alpha2: return KeyCode.Alpha2; case Key.Alpha3: return KeyCode.Alpha3;
                case Key.Backspace: return KeyCode.Backspace;
            }
            return KeyCode.None;
        }
        public static bool Held(Key k) => UnityEngine.Input.GetKey(Map(k));
        public static bool Down(Key k) => UnityEngine.Input.GetKeyDown(Map(k));
        public static bool Up(Key k) => UnityEngine.Input.GetKeyUp(Map(k));
        public static bool MouseHeld(int b) => UnityEngine.Input.GetMouseButton(b);
        public static bool MouseDown(int b) => UnityEngine.Input.GetMouseButtonDown(b);
        public static Vector2 MouseDelta() => new Vector2(UnityEngine.Input.GetAxisRaw("Mouse X"), UnityEngine.Input.GetAxisRaw("Mouse Y"));
        public static float Scroll() => UnityEngine.Input.mouseScrollDelta.y;
#endif
    }
}
