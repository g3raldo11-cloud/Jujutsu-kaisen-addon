using System.Collections.Generic;
using Lendas.Core;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Lendas.Game
{
    /// <summary>
    /// VERSÃO DE TESTE — Arena vazia com boneco de treino.
    /// Escolha uma entidade (Saci, Boitatá ou Curupira) e teste todas as habilidades no boneco.
    /// A lógica roda na mesma simulação autoritativa usada pelas partidas (tick fixo de 30 Hz);
    /// esta classe só envia comandos, avança a simulação e sincroniza a apresentação.
    /// </summary>
    public sealed class ArenaGame : MonoBehaviour
    {
        public CharacterId PlayerCharacter = CharacterId.SaciPerere;
        public bool AllyEnabled;

        public Simulation Sim { get; private set; }
        public Champion Player { get; private set; }
        public Champion Ally { get; private set; }
        public TrainingDummy Dummy { get; private set; }
        public ThirdPersonCamera Cam { get; private set; }
        public ArenaInput Input { get; } = new ArenaInput();
        public bool ShowHelp = true;

        public struct Floater { public Vector3 Pos; public string Text; public Color Color; public float Age; }
        public readonly List<Floater> Floaters = new List<Floater>();
        public readonly List<string> Log = new List<string>();

        private readonly Dictionary<int, UnitView> _views = new Dictionary<int, UnitView>();
        private readonly Dictionary<int, ZoneView> _zones = new Dictionary<int, ZoneView>();
        private readonly List<int> _remove = new List<int>();
        private Transform _arenaRoot;
        private Transform _unitsRoot;
        private RangeIndicator _indicator;
        private float _accumulator;

        /// <summary>Ao dar Play numa cena vazia (ou na cena da arena), a arena se monta sozinha.</summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void AutoStart()
        {
            if (FindFirstObjectByType<ArenaGame>() != null) return;
            var scene = SceneManager.GetActiveScene();
            bool emptyScene = scene.rootCount <= 2;
            if (!emptyScene && scene.name != "ArenaDeTeste") return;
            new GameObject("Arena de Teste (ArenaGame)").AddComponent<ArenaGame>();
        }

        private void Start()
        {
            Application.targetFrameRate = 120;
            var cam = Camera.main;
            if (cam == null) cam = new GameObject("Main Camera") { tag = "MainCamera" }.AddComponent<Camera>();
            if (cam.GetComponent<AudioListener>() == null && FindFirstObjectByType<AudioListener>() == null) cam.gameObject.AddComponent<AudioListener>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.62f, 0.55f, 0.5f);
            cam.farClipPlane = 200f;
            Cam = cam.GetComponent<ThirdPersonCamera>();
            if (Cam == null) Cam = cam.gameObject.AddComponent<ThirdPersonCamera>();
            // Remove a luz padrão da cena vazia; a arena tem iluminação própria.
            foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None)) if (l.type == LightType.Directional) Destroy(l.gameObject);
            _indicator = new GameObject("Indicador de Alcance").AddComponent<RangeIndicator>();
            if (GetComponent<ArenaHud>() == null) gameObject.AddComponent<ArenaHud>();
            Restart(PlayerCharacter);
        }

        /// <summary>Recria a simulação com a entidade escolhida (troca de personagem / reiniciar).</summary>
        public void Restart(CharacterId character)
        {
            PlayerCharacter = character;
            foreach (var v in _views.Values) if (v != null) Destroy(v.gameObject);
            foreach (var z in _zones.Values) if (z != null) Destroy(z.gameObject);
            _views.Clear();
            _zones.Clear();
            if (_unitsRoot != null) Destroy(_unitsRoot.gameObject);
            VfxFactory.Reset();
            Floaters.Clear();

            Sim = new Simulation(MatchConfig.TestArena());
            if (_arenaRoot == null) _arenaRoot = ArenaBuilder.Build(Sim.Map);
            _unitsRoot = new GameObject("Unidades").transform;

            Player = Sim.AddChampion(Team.Aurora, character, "Você", false);
            Player.Position = new Vec2(-6f, 0f);
            Dummy = new TrainingDummy(Sim, new Vec2(4f, 0f));
            Ally = null;
            if (AllyEnabled)
            {
                var allyChar = character == CharacterId.Boitata ? CharacterId.SaciPerere : CharacterId.Boitata;
                if (character == CharacterId.SaciPerere) allyChar = CharacterId.Curupira;
                Ally = Sim.AddChampion(Team.Aurora, allyChar, "Aliado (bot)", true);
                Ally.Position = new Vec2(-6f, 4f);
            }
            Cam.Target = CreateView(Player).transform;
            Cam.Yaw = 90f;
            AddLog($"Arena pronta: {Player.Stats.DisplayName}" + (Ally != null ? $" + aliado {Ally.Stats.DisplayName}" : ""));
        }

        private UnitView CreateView(Unit u)
        {
            var go = new GameObject();
            go.transform.SetParent(_unitsRoot, false);
            UnitView view;
            if (Dummy != null && u == Dummy.Unit) view = go.AddComponent<DummyView>();
            else
            {
                CharacterId c = u is Champion ch ? ch.Character : ((Decoy)u).Character;
                switch (c)
                {
                    case CharacterId.Boitata: view = go.AddComponent<BoitataView>(); break;
                    case CharacterId.Curupira: view = go.AddComponent<CurupiraView>(); break;
                    default: view = go.AddComponent<SaciView>(); break;
                }
            }
            view.Bind(u);
            _views[u.Id] = view;
            return view;
        }

        private void Update()
        {
            if (Sim == null) return;
            Input.Poll();
            HandleMetaKeys();

            Vector3 aimWorld = Cam.AimPoint(14f);
            Vector3 move = Cam.MoveDirection(Input.MoveAxes);

            _accumulator += Mathf.Min(Time.deltaTime, 0.1f);
            int steps = 0;
            while (_accumulator >= Simulation.Dt && steps < 5)
            {
                _accumulator -= Simulation.Dt;
                steps++;
                Sim.ClearEvents();
                Sim.SetCommand(Player.Id, Input.Build(move.ToSim(), aimWorld.ToSim()));
                Sim.Step();
                Dummy.AfterStep(Simulation.Dt);
                ProcessEvents();
            }
            SyncViews(Time.deltaTime);
            UpdateIndicator(aimWorld);
            for (int i = Floaters.Count - 1; i >= 0; i--)
            {
                var f = Floaters[i];
                f.Age += Time.deltaTime;
                f.Pos += Vector3.up * Time.deltaTime * 1.2f;
                if (f.Age > 1.1f) Floaters.RemoveAt(i); else Floaters[i] = f;
            }
        }

        private void HandleMetaKeys()
        {
            if (ArenaInput.Down(ArenaInput.Key.Alpha1)) Restart(CharacterId.SaciPerere);
            if (ArenaInput.Down(ArenaInput.Key.Alpha2)) Restart(CharacterId.Boitata);
            if (ArenaInput.Down(ArenaInput.Key.Alpha3)) Restart(CharacterId.Curupira);
            if (ArenaInput.Down(ArenaInput.Key.M)) { Dummy.Moving = !Dummy.Moving; AddLog(Dummy.Moving ? "Boneco em movimento" : "Boneco parado"); }
            if (ArenaInput.Down(ArenaInput.Key.Backspace)) { Dummy.ResetStats(); AddLog("Boneco reiniciado"); }
            if (ArenaInput.Down(ArenaInput.Key.H)) ShowHelp = !ShowHelp;
            if (ArenaInput.Down(ArenaInput.Key.Tab)) ToggleAlly();
        }

        public void ToggleAlly()
        {
            AllyEnabled = !AllyEnabled;
            Restart(PlayerCharacter);
        }

        private void UpdateIndicator(Vector3 aimWorld)
        {
            var slot = Input.Previewing;
            if (slot.HasValue && Player.Alive) _indicator.Show(Player.Stats.Ability(slot.Value), Player.Position.ToWorld(), aimWorld);
            else _indicator.Hide();
        }

        private void SyncViews(float dt)
        {
            foreach (var c in Sim.Champions) if (!_views.ContainsKey(c.Id)) CreateView(c);
            foreach (var d in Sim.Decoys) if (!_views.ContainsKey(d.Id)) CreateView(d);
            _remove.Clear();
            foreach (var kv in _views)
            {
                var u = Sim.FindUnit(kv.Key);
                if (u == null || (u is Decoy && !u.Alive)) { _remove.Add(kv.Key); continue; }
                kv.Value.Sync(dt);
            }
            foreach (var id in _remove)
            {
                if (_views[id] != null) Destroy(_views[id].gameObject);
                _views.Remove(id);
            }

            foreach (var z in Sim.Zones)
            {
                if (_zones.ContainsKey(z.Id)) continue;
                var go = new GameObject();
                go.transform.SetParent(_unitsRoot, false);
                var zv = go.AddComponent<ZoneView>();
                zv.Bind(z);
                _zones[z.Id] = zv;
            }
            _remove.Clear();
            foreach (var kv in _zones)
            {
                bool alive = false;
                foreach (var z in Sim.Zones) if (z.Id == kv.Key) { alive = true; break; }
                if (!alive) { _remove.Add(kv.Key); continue; }
                kv.Value.Sync(dt);
            }
            foreach (var id in _remove)
            {
                if (_zones[id] != null) Destroy(_zones[id].gameObject, 0.6f);
                _zones.Remove(id);
            }
        }

        /// <summary>Traduz eventos da simulação em feedback visual e sonoro.</summary>
        private void ProcessEvents()
        {
            foreach (var e in Sim.Events)
            {
                Vector3 pos = e.Position.ToWorld(1f);
                switch (e.Type)
                {
                    case SimEventType.Damage:
                        if (_views.TryGetValue(e.TargetId, out var hv)) hv.OnHit();
                        if (e.Value >= 3f)
                        {
                            AddFloater(pos + Vector3.up * 1.2f, Mathf.RoundToInt(e.Value).ToString(), e.SourceId == Player.Id ? new Color(1f, 0.85f, 0.3f) : new Color(1f, 0.5f, 0.4f));
                            VfxFactory.Burst(pos, new Color(1f, 0.75f, 0.4f), 10, 3f, 0.2f);
                            SoundBank.Play(Sfx.Impacto, pos, 0.5f, Random.Range(0.9f, 1.1f));
                        }
                        else AccumulateTick(e);
                        break;
                    case SimEventType.BasicAttack:
                        if (_views.TryGetValue(e.SourceId, out var av)) av.OnBasicAttack();
                        SoundBank.Play(Sfx.Golpe, pos, 0.6f, Random.Range(0.9f, 1.15f));
                        break;
                    case SimEventType.BasicMiss:
                        AddFloater(pos + Vector3.up, "errou!", Color.gray);
                        SoundBank.Play(Sfx.Erro, pos);
                        break;
                    case SimEventType.AbilityCast:
                        AddLog($"{NameOf(e.SourceId)}: {e.Text}");
                        PlayAbilitySound(e, pos);
                        break;
                    case SimEventType.AbilityRecast:
                        if (e.Text == "Labareda") { SoundBank.Play(Sfx.Fogo, pos, 0.7f, 1.3f); break; }
                        AddLog($"{NameOf(e.SourceId)}: {e.Text} (reativação)");
                        break;
                    case SimEventType.Swap:
                        VfxFactory.Burst(pos, new Color(0.8f, 0.7f, 0.5f), 30, 5f, 0.3f);
                        SoundBank.Play(Sfx.Troca, pos);
                        break;
                    case SimEventType.Blink:
                        VfxFactory.Burst(pos, new Color(0.9f, 0.95f, 1f), 40, 7f, 0.35f);
                        SoundBank.Play(Sfx.Vento, pos, 1f, 1.4f);
                        break;
                    case SimEventType.Dodge:
                        SoundBank.Play(Sfx.Esquiva, pos);
                        break;
                    case SimEventType.Jump:
                        SoundBank.Play(Sfx.Salto, pos);
                        break;
                    case SimEventType.ZoneExploded:
                        VfxFactory.Burst(pos, new Color(1f, 0.55f, 0.1f), 35, 8f, 0.5f);
                        SoundBank.Play(Sfx.Impacto, pos, 0.9f, 0.7f);
                        break;
                    case SimEventType.SynergyTriggered:
                        AddLog($"★ RESSONÂNCIA: {e.Text}!");
                        AddFloater(pos + Vector3.up * 2f, e.Text, new Color(1f, 0.9f, 0.4f));
                        SoundBank.Play(Sfx.Sinergia, pos);
                        break;
                    case SimEventType.DecoyBroken:
                        VfxFactory.Burst(pos, new Color(0.7f, 0.6f, 0.45f), 25, 4f, 0.25f);
                        break;
                }
            }
        }

        // Dano contínuo (queimaduras, zonas) é somado e exibido a cada 0,5 s para não poluir a tela.
        private float _tickDamage;
        private float _tickTimer;
        private Vector3 _tickPos;
        private void AccumulateTick(SimEvent e)
        {
            _tickDamage += e.Value;
            _tickPos = e.Position.ToWorld(2.2f);
            _tickTimer += Simulation.Dt;
            if (_tickTimer >= 0.5f)
            {
                if (_tickDamage >= 1f) AddFloater(_tickPos, Mathf.RoundToInt(_tickDamage).ToString(), new Color(1f, 0.55f, 0.15f));
                _tickDamage = 0f;
                _tickTimer = 0f;
            }
        }

        private void PlayAbilitySound(SimEvent e, Vector3 pos)
        {
            var c = Sim.FindChampion(e.SourceId);
            if (c == null) return;
            var slot = (AbilitySlot)e.Slot;
            Sfx s = Sfx.Golpe;
            switch (c.Character)
            {
                case CharacterId.SaciPerere: s = slot == AbilitySlot.Habilidade2 ? Sfx.Troca : (slot == AbilitySlot.Suprema ? Sfx.Suprema : Sfx.Vento); break;
                case CharacterId.Boitata: s = slot == AbilitySlot.Habilidade2 ? Sfx.Ofuscar : (slot == AbilitySlot.Habilidade1 ? Sfx.Investida : (slot == AbilitySlot.Suprema ? Sfx.Suprema : Sfx.Fogo)); break;
                case CharacterId.Curupira: s = slot == AbilitySlot.Suprema ? Sfx.Suprema : (slot == AbilitySlot.Habilidade2 ? Sfx.Investida : Sfx.Fogo); break;
            }
            SoundBank.Play(s, pos);
        }

        private string NameOf(int id) => Sim.FindChampion(id)?.PlayerName ?? "?";

        public void AddFloater(Vector3 pos, string text, Color color) =>
            Floaters.Add(new Floater { Pos = pos + new Vector3(Random.Range(-0.3f, 0.3f), 0f, Random.Range(-0.3f, 0.3f)), Text = text, Color = color });

        public void AddLog(string line)
        {
            Log.Add(line);
            if (Log.Count > 7) Log.RemoveAt(0);
        }
    }
}
