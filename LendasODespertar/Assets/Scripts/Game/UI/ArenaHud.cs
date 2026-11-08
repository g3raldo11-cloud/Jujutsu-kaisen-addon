using System.Text;
using Lendas.Core;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>
    /// Interface da Arena de Teste (IMGUI, sem assets). Paleta inspirada em cores brasileiras:
    /// verde-mata, amarelo-ouro, terracota e azul-noite. Mostra vida, energia, recurso exclusivo,
    /// recargas, estatísticas do boneco, números de dano, registro e ajuda de controles.
    /// </summary>
    public sealed class ArenaHud : MonoBehaviour
    {
        private ArenaGame _game;
        private GUIStyle _title, _label, _small, _center, _floater, _button, _keycap;
        private Texture2D _panel, _white;
        private static readonly Color Mata = new Color(0.06f, 0.22f, 0.14f, 0.88f);
        private static readonly Color Ouro = new Color(0.98f, 0.8f, 0.2f);
        private static readonly Color Terracota = new Color(0.78f, 0.36f, 0.2f);
        private static readonly Color Noite = new Color(0.07f, 0.09f, 0.16f, 0.9f);

        private void Awake() => _game = GetComponent<ArenaGame>();

        private void InitStyles()
        {
            if (_title != null) return;
            _white = Texture2D.whiteTexture;
            _panel = new Texture2D(1, 1);
            _panel.SetPixel(0, 0, Mata);
            _panel.Apply();
            _title = new GUIStyle(GUI.skin.label) { fontSize = 20, fontStyle = FontStyle.Bold, normal = { textColor = Ouro } };
            _label = new GUIStyle(GUI.skin.label) { fontSize = 14, normal = { textColor = Color.white }, richText = true };
            _small = new GUIStyle(GUI.skin.label) { fontSize = 12, normal = { textColor = new Color(0.9f, 0.9f, 0.85f) }, richText = true, wordWrap = true };
            _center = new GUIStyle(_label) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            _floater = new GUIStyle(GUI.skin.label) { fontSize = 20, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            _button = new GUIStyle(GUI.skin.button) { fontSize = 13 };
            _keycap = new GUIStyle(_center) { fontSize = 12, normal = { textColor = Ouro } };
        }

        private void OnGUI()
        {
            if (_game == null || _game.Sim == null) return;
            InitStyles();
            DrawTopPanel();
            DrawPlayerBars();
            DrawAbilities();
            DrawDummyPanel();
            DrawLog();
            DrawFloaters();
            DrawCrosshair();
            if (_game.ShowHelp) DrawHelp();
        }

        private void Box(Rect r, Color c)
        {
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, _white);
            GUI.color = old;
        }

        private void Bar(Rect r, float frac, Color fill, string text)
        {
            Box(r, new Color(0f, 0f, 0f, 0.6f));
            Box(new Rect(r.x + 2, r.y + 2, (r.width - 4) * Mathf.Clamp01(frac), r.height - 4), fill);
            GUI.Label(r, text, _center);
        }

        private void DrawTopPanel()
        {
            var r = new Rect(12, 12, 470, 112);
            Input2Gui.PanelRect = r;
            Box(r, Mata);
            Box(new Rect(r.x, r.y, r.width, 3), Ouro);
            GUI.Label(new Rect(r.x + 12, r.y + 6, 450, 26), "LENDAS: O DESPERTAR — Arena de Teste", _title);
            GUI.Label(new Rect(r.x + 12, r.y + 32, 450, 20), "<i>versão de teste: arena vazia + boneco de treino</i>", _small);
            float x = r.x + 12, y = r.y + 56;
            if (GUI.Button(new Rect(x, y, 140, 26), Sel(CharacterId.SaciPerere) + "1 · Saci-Pererê", _button)) _game.Restart(CharacterId.SaciPerere);
            if (GUI.Button(new Rect(x + 148, y, 140, 26), Sel(CharacterId.Boitata) + "2 · Boitatá", _button)) _game.Restart(CharacterId.Boitata);
            if (GUI.Button(new Rect(x + 296, y, 150, 26), Sel(CharacterId.Curupira) + "3 · Curupira", _button)) _game.Restart(CharacterId.Curupira);
            y += 30;
            if (GUI.Button(new Rect(x, y, 140, 24), (_game.AllyEnabled ? "✔ " : "") + "Tab · Aliado bot", _button)) _game.ToggleAlly();
            if (GUI.Button(new Rect(x + 148, y, 140, 24), (_game.Dummy.Moving ? "✔ " : "") + "M · Boneco anda", _button)) _game.Dummy.Moving = !_game.Dummy.Moving;
            if (GUI.Button(new Rect(x + 296, y, 150, 24), "⌫ · Zerar boneco", _button)) _game.Dummy.ResetStats();
        }

        private string Sel(CharacterId id) => _game.PlayerCharacter == id ? "▶ " : "";

        private void DrawPlayerBars()
        {
            var p = _game.Player;
            float w = 420, x = (Screen.width - w) / 2f, y = Screen.height - 150;
            Box(new Rect(x - 10, y - 32, w + 20, 152), Noite);
            Box(new Rect(x - 10, y - 32, w + 20, 3), Terracota);
            GUI.Label(new Rect(x, y - 30, w, 24), $"<b>{p.Stats.DisplayName}</b>  <size=12><color=#f5d76e>{p.Stats.Role}</color></size>", _label);
            Bar(new Rect(x, y, w, 20), p.HpFraction, new Color(0.2f, 0.75f, 0.3f), $"Vida {Mathf.CeilToInt(p.Hp)}/{p.MaxHp:0}");
            Bar(new Rect(x, y + 22, w, 14), p.Energy / p.MaxEnergy, new Color(0.3f, 0.55f, 1f), $"Energia espiritual {p.Energy:0}");
            var kit = p.Kit;
            if (kit.ResourceName != null)
            {
                float frac = kit.ResourceValue / kit.ResourceMax;
                Color c = Color.Lerp(new Color(1f, 0.6f, 0.2f), new Color(1f, 0.25f, 0.05f), frac);
                if (p.Character == CharacterId.SaciPerere) c = new Color(0.85f, 0.75f, 0.5f);
                string extra = "";
                if (kit is CurupiraKit ck && ck.IsHot) extra = "  — INCANDESCENTE!";
                if (kit is BoitataKit bk && bk.Heat >= BoitataKit.BurningBodyHeat) extra = "  — corpo em brasa";
                Bar(new Rect(x, y + 38, w, 14), frac, c, $"{kit.ResourceName} {kit.ResourceValue:0}/{kit.ResourceMax:0}{extra}");
            }
            Bar(new Rect(x, y + 54, w * 0.5f - 2, 10), p.Stamina / 100f, new Color(0.9f, 0.9f, 0.6f), "");
            Bar(new Rect(x + w * 0.5f + 2, y + 54, w * 0.5f - 2, 10), p.UltCharge / 100f, Ouro, "");
            GUI.Label(new Rect(x, y + 62, w, 18), $"<size=11>Fôlego (Shift)                                              Carga da Suprema {p.UltCharge:0}%</size>", _small);
        }

        private void DrawAbilities()
        {
            var p = _game.Player;
            string[] keys = { "Clique", "Q", "E", "F", "R" };
            float size = 64, gap = 8;
            float total = 5 * size + 4 * gap + 2 * (size * 0.7f + gap);
            float x = (Screen.width - total) / 2f, y = Screen.height - 64 - 10;
            for (int i = 0; i < 5; i++)
            {
                var def = p.Stats.Abilities[i];
                var slot = (AbilitySlot)i;
                var r = new Rect(x, y, size, size);
                bool recast = p.Kit.IsRecastAvailable(slot);
                Box(r, recast ? new Color(0.9f, 0.7f, 0.15f, 0.95f) : new Color(0.12f, 0.3f, 0.2f, 0.95f));
                float cd = p.Cooldowns[i];
                bool lacksEnergy = def != null && p.Energy < def.EnergyCost;
                if (cd > 0f && !recast)
                {
                    float frac = Mathf.Clamp01(cd / Mathf.Max(0.01f, def.Cooldown));
                    Box(new Rect(r.x, r.y + r.height * (1f - frac), r.width, r.height * frac), new Color(0f, 0f, 0f, 0.65f));
                }
                if (slot == AbilitySlot.Suprema && p.UltCharge < 100f) Box(r, new Color(0f, 0f, 0f, 0.4f));
                if (lacksEnergy) Box(new Rect(r.x, r.yMax - 4, r.width, 4), new Color(0.3f, 0.5f, 1f));
                GUI.Label(new Rect(r.x, r.y + 2, r.width, 16), keys[i], _keycap);
                GUI.Label(new Rect(r.x + 2, r.y + 16, r.width - 4, 34), $"<size=10>{def?.Name}</size>", new GUIStyle(_small) { alignment = TextAnchor.MiddleCenter });
                if (cd > 0f && !recast) GUI.Label(new Rect(r.x, r.y + 44, r.width, 18), cd.ToString("0.0"), _center);
                else if (recast) GUI.Label(new Rect(r.x, r.y + 44, r.width, 18), "<size=10>REATIVAR</size>", _center);
                if (r.Contains(Event.current.mousePosition) && def != null) Tooltip(r, def);
                x += size + gap;
            }
            Mini(ref x, y, size, "Ctrl", "Esquiva", _game.Player.DodgeCooldown, 4.5f);
            Mini(ref x, y, size, "Espaço", "Salto", _game.Player.JumpCooldown, 1.2f);
        }

        private void Mini(ref float x, float y, float size, string key, string name, float cd, float max)
        {
            float s = size * 0.7f;
            var r = new Rect(x, y + size - s, s, s);
            Box(r, new Color(0.25f, 0.18f, 0.12f, 0.95f));
            if (cd > 0f) Box(new Rect(r.x, r.y + r.height * (1f - cd / max), r.width, r.height * cd / max), new Color(0f, 0f, 0f, 0.6f));
            GUI.Label(new Rect(r.x, r.y + 2, r.width, 14), $"<size=10>{key}</size>", _keycap);
            GUI.Label(new Rect(r.x, r.y + 18, r.width, 22), $"<size=10>{name}</size>", _center);
            x += s + 8;
        }

        private void Tooltip(Rect anchor, AbilityDef def)
        {
            var r = new Rect(anchor.x - 100, anchor.y - 130, 300, 120);
            Box(r, Noite);
            GUI.Label(new Rect(r.x + 8, r.y + 4, r.width - 16, r.height - 8),
                $"<b>{def.Name}</b>  <color=#f5d76e>recarga {def.Cooldown:0.#}s · energia {def.EnergyCost:0}</color>\n{def.Description}", _small);
        }

        private void DrawDummyPanel()
        {
            var d = _game.Dummy;
            var r = new Rect(Screen.width - 292, 12, 280, 210);
            Box(r, Mata);
            Box(new Rect(r.x, r.y, r.width, 3), Ouro);
            GUI.Label(new Rect(r.x + 10, r.y + 6, 260, 24), "Boneco de Teste", _title);
            var sb = new StringBuilder();
            sb.AppendLine($"Dano total: <b>{d.TotalDamage:0}</b>");
            sb.AppendLine($"Último golpe: <b>{d.LastHit:0}</b>");
            sb.AppendLine($"DPS (último segundo): <b>{d.Dps:0}</b>");
            sb.AppendLine($"Vida: {d.Unit.Hp:0}/{d.Unit.MaxHp:0}");
            sb.Append("Efeitos: ");
            if (d.Unit.Status.Effects.Count == 0) sb.Append("<color=#aaaaaa>nenhum</color>");
            foreach (var e in d.Unit.Status.Effects) sb.Append($"<color=#ffb347>{StatusName(e.Type)}</color> {e.Remaining:0.0}s  ");
            GUI.Label(new Rect(r.x + 10, r.y + 34, 260, 120), sb.ToString(), _label);

            var p = _game.Player;
            var sim = _game.Sim;
            if (_game.Ally != null)
            {
                var syn = new StringBuilder("<b>Ressonâncias</b>\n");
                foreach (var rule in SynergySystem.All)
                {
                    float cd = sim.Synergy.CooldownRemaining(p.Team, rule);
                    syn.AppendLine($"{rule.Name}: {(cd > 0f ? $"{cd:0}s" : "<color=#7CFC00>pronta</color>")}");
                }
                GUI.Label(new Rect(r.x + 10, r.y + 140, 260, 70), syn.ToString(), _small);
            }
        }

        private static string StatusName(StatusType t)
        {
            switch (t)
            {
                case StatusType.Lentidao: return "Lentidão";
                case StatusType.Enraizado: return "Enraizado";
                case StatusType.Atordoado: return "Atordoado";
                case StatusType.Escudo: return "Escudo";
                case StatusType.Ofuscado: return "Ofuscado";
                case StatusType.Ventania: return "Ventania";
                case StatusType.Pressa: return "Pressa";
                case StatusType.Queimadura: return "Queimadura";
                case StatusType.Imparavel: return "Imparável";
            }
            return t.ToString();
        }

        private void DrawLog()
        {
            float y = Screen.height - 330;
            var r = new Rect(12, y, 360, 150);
            Box(r, new Color(0f, 0f, 0f, 0.35f));
            float ly = r.y + 6;
            foreach (var line in _game.Log)
            {
                GUI.Label(new Rect(r.x + 8, ly, r.width - 16, 20), line, _small);
                ly += 20;
            }
        }

        private void DrawFloaters()
        {
            var cam = Camera.main;
            if (cam == null) return;
            foreach (var f in _game.Floaters)
            {
                Vector3 sp = cam.WorldToScreenPoint(f.Pos);
                if (sp.z < 0f) continue;
                var c = f.Color;
                c.a = Mathf.Clamp01(1.2f - f.Age);
                _floater.normal.textColor = new Color(0f, 0f, 0f, c.a);
                var rr = new Rect(sp.x - 80, Screen.height - sp.y - 15, 160, 30);
                GUI.Label(new Rect(rr.x + 2, rr.y + 2, rr.width, rr.height), f.Text, _floater);
                _floater.normal.textColor = c;
                GUI.Label(rr, f.Text, _floater);
            }
        }

        private void DrawCrosshair()
        {
            float cx = Screen.width / 2f, cy = Screen.height / 2f;
            Box(new Rect(cx - 8, cy - 1, 16, 2), new Color(1f, 1f, 1f, 0.8f));
            Box(new Rect(cx - 1, cy - 8, 2, 16), new Color(1f, 1f, 1f, 0.8f));
        }

        private void DrawHelp()
        {
            var r = new Rect(12, 136, 300, 250);
            Box(r, Noite);
            GUI.Label(new Rect(r.x + 10, r.y + 6, r.width - 20, r.height - 12),
                "<b>Controles</b>  <color=#aaaaaa>(H esconde)</color>\n" +
                "WASD · mover (relativo à câmera)\n" +
                "Mouse · girar câmera / mirar · Roda · zoom\n" +
                "Clique esquerdo · ataque básico\n" +
                "Q / E / F · habilidades — <i>segure para ver o alcance, solte para lançar</i>\n" +
                "R · Suprema (aperte de novo para reativar)\n" +
                "Shift · correr · Espaço · saltar\n" +
                "Ctrl ou clique direito · esquiva\n" +
                "1 / 2 / 3 · trocar entidade · Tab · aliado bot\n" +
                "M · boneco anda · Backspace · zerar boneco\n" +
                "Esc · soltar / prender o cursor", _small);
        }
    }
}
