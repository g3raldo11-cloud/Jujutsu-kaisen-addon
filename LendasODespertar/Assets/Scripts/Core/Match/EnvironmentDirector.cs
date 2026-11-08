using System.Collections.Generic;

namespace Lendas.Core
{
    public enum EnvironmentEventKind { CheiaDoRio, NevoaDaMata, RaizesAntigas, Assombracoes }

    public sealed class EnvironmentEvent
    {
        public EnvironmentEventKind Kind;
        public string Name;
        public string Description;
        public float FirstStart;
        public float Duration;
        public float Period;
        public float WarningTime = 10f;
        public bool Active;
        public bool Warned;
        public float NextStart;
        public float EndsAt;
    }

    /// <summary>
    /// Ambiente vivo: eventos ambientais com horário fixo e aviso prévio (10 s),
    /// previsíveis o suficiente para estratégia competitiva.
    /// </summary>
    public sealed class EnvironmentDirector
    {
        private readonly Simulation _sim;
        public readonly List<EnvironmentEvent> Events = new List<EnvironmentEvent>();

        public EnvironmentDirector(Simulation sim)
        {
            _sim = sim;
            Events.Add(new EnvironmentEvent
            {
                Kind = EnvironmentEventKind.CheiaDoRio, Name = "Cheia do Rio",
                Description = "O igarapé transborda: a margem sul do rio vira água (lentidão para quem não é aquático) e o Marco das Águas produz o dobro.",
                FirstStart = 100f, Duration = 40f, Period = 240f,
            });
            Events.Add(new EnvironmentEvent
            {
                Kind = EnvironmentEventKind.NevoaDaMata, Name = "Névoa da Mata",
                Description = "Uma névoa espessa cobre a Mata Fechada: a visão na região cai para 5 metros.",
                FirstStart = 160f, Duration = 45f, Period = 240f,
            });
            Events.Add(new EnvironmentEvent
            {
                Kind = EnvironmentEventKind.RaizesAntigas, Name = "Raízes Antigas",
                Description = "Raízes gigantes brotam e fecham as passagens norte e sul do santuário central.",
                FirstStart = 240f, Duration = 40f, Period = 240f,
            });
            Events.Add(new EnvironmentEvent
            {
                Kind = EnvironmentEventKind.Assombracoes, Name = "Assombrações",
                Description = "Espíritos errantes surgem nas ruínas. Derrotá-los libera Ecos Espirituais.",
                FirstStart = 300f, Duration = 60f, Period = 240f,
            });
            foreach (var e in Events) e.NextStart = e.FirstStart;
        }

        public bool IsActive(EnvironmentEventKind kind)
        {
            foreach (var e in Events) if (e.Kind == kind) return e.Active;
            return false;
        }

        public EnvironmentEvent Get(EnvironmentEventKind kind)
        {
            foreach (var e in Events) if (e.Kind == kind) return e;
            return null;
        }

        public bool IsFogged(Vec2 p) => IsActive(EnvironmentEventKind.NevoaDaMata) && _sim.Map.RegionAt(p) == MapRegion.Mata;

        /// <summary>Próximo evento (para a interface): nome e segundos até começar.</summary>
        public EnvironmentEvent NextUpcoming()
        {
            EnvironmentEvent best = null;
            foreach (var e in Events)
            {
                if (e.Active) continue;
                if (best == null || e.NextStart < best.NextStart) best = e;
            }
            return best;
        }

        public void Tick(float dt)
        {
            if (!_sim.Config.EnvironmentEvents) return;
            float t = _sim.Time;
            foreach (var e in Events)
            {
                if (!e.Active)
                {
                    if (!e.Warned && t >= e.NextStart - e.WarningTime)
                    {
                        e.Warned = true;
                        _sim.Emit(SimEventType.EnvironmentWarning, 0, 0, default, e.NextStart - t, e.Name, Team.None, (int)e.Kind);
                    }
                    if (t >= e.NextStart) Start(e);
                }
                else if (t >= e.EndsAt) Stop(e);
            }
        }

        public void ForceStart(EnvironmentEventKind kind)
        {
            var e = Get(kind);
            if (e != null && !e.Active) { e.NextStart = _sim.Time; Start(e); }
        }

        private void Start(EnvironmentEvent e)
        {
            e.Active = true;
            e.EndsAt = _sim.Time + e.Duration;
            switch (e.Kind)
            {
                case EnvironmentEventKind.CheiaDoRio:
                    foreach (var a in _sim.Map.Areas) if (a.EventTag == "cheia") a.Active = true;
                    break;
                case EnvironmentEventKind.RaizesAntigas:
                    foreach (var o in _sim.Map.Obstacles) if (o.VisualTag == "raizes") o.Active = true;
                    _sim.Nav.Rebuild();
                    // Ninguém fica preso dentro das raízes.
                    foreach (var c in _sim.Champions) if (c.Alive) c.Position = _sim.ResolveObstacles(c.Position, c.Radius * c.Kit.RadiusMultiplier);
                    break;
                case EnvironmentEventKind.Assombracoes:
                    foreach (var p in _sim.Map.SpiritSpawnPoints) NeutralAI.Spawn(_sim, p);
                    break;
            }
            _sim.Emit(SimEventType.EnvironmentStarted, 0, 0, default, e.Duration, e.Name, Team.None, (int)e.Kind);
        }

        private void Stop(EnvironmentEvent e)
        {
            e.Active = false;
            e.Warned = false;
            e.NextStart += e.Period;
            switch (e.Kind)
            {
                case EnvironmentEventKind.CheiaDoRio:
                    foreach (var a in _sim.Map.Areas) if (a.EventTag == "cheia") a.Active = false;
                    break;
                case EnvironmentEventKind.RaizesAntigas:
                    foreach (var o in _sim.Map.Obstacles) if (o.VisualTag == "raizes") o.Active = false;
                    _sim.Nav.Rebuild();
                    break;
                case EnvironmentEventKind.Assombracoes:
                    foreach (var s in _sim.Spirits) s.Alive = false;
                    _sim.Spirits.Clear();
                    break;
            }
            _sim.Emit(SimEventType.EnvironmentEnded, 0, 0, default, 0f, e.Name, Team.None, (int)e.Kind);
        }
    }
}
