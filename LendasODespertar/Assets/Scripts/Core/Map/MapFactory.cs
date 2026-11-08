namespace Lendas.Core
{
    /// <summary>
    /// Mapas do jogo. Etapa 2 entrega o mapa de demonstração "Floresta Amazônica — Igarapé das Ruínas".
    /// Layout espelhado (Aurora a oeste, Crepúsculo a leste) para equilíbrio 5v5.
    /// Três regiões conectadas: Rio (norte), Ruínas (centro) e Mata Fechada (sul).
    /// </summary>
    public static class MapFactory
    {
        public const string FlorestaAmazonica = "floresta_amazonica";
        public const string ArenaDeTeste = "arena_teste";

        public static MapLayout Create(string id)
        {
            switch (id)
            {
                case ArenaDeTeste:
                    return CreateArenaDeTeste();
                case FlorestaAmazonica:
                default:
                    return CreateFlorestaAmazonica();
            }
        }

        public static MapLayout CreateFlorestaAmazonica()
        {
            var m = new MapLayout
            {
                Id = FlorestaAmazonica,
                DisplayName = "Floresta Amazônica — Igarapé das Ruínas",
                Min = new Vec2(-62f, -42f),
                Max = new Vec2(62f, 42f),
                HeartPosition = Vec2.Zero,
            };
            m.BaseCenter[(int)Team.Aurora] = new Vec2(-54f, 0f);
            m.BaseCenter[(int)Team.Crepusculo] = new Vec2(54f, 0f);

            // --- Rio (norte): igarapé que atravessa o mapa, com bancos de areia e troncos.
            m.Areas.Add(new TerrainArea { Kind = TerrainKind.Agua, Name = "Igarapé", IsBox = true, Center = new Vec2(0f, 29f), HalfExtents = new Vec2(44f, 5f) });
            // Cheia do Rio (evento): o igarapé transborda para o sul e alaga a passagem norte das ruínas.
            m.Areas.Add(new TerrainArea { Kind = TerrainKind.Agua, Name = "Cheia do Rio", IsBox = true, Center = new Vec2(0f, 20f), HalfExtents = new Vec2(36f, 5f), Active = false, EventTag = "cheia" });

            // --- Mata Fechada (sul): moitas que escondem quem está dentro.
            AddMirrored(m, (x, y) => m.Areas.Add(new TerrainArea { Kind = TerrainKind.Vegetacao, Name = "Moita", Center = new Vec2(x, y), Radius = 4.5f }),
                new[] { new Vec2(-14f, -22f), new Vec2(-30f, -30f), new Vec2(-8f, -34f), new Vec2(-24f, -14f) });
            m.Areas.Add(new TerrainArea { Kind = TerrainKind.Vegetacao, Name = "Moita Central Sul", Center = new Vec2(0f, -18f), Radius = 4f });
            // Moitas laterais no rio e nas ruínas para rotas de emboscada.
            AddMirrored(m, (x, y) => m.Areas.Add(new TerrainArea { Kind = TerrainKind.Vegetacao, Name = "Capim Alto", Center = new Vec2(x, y), Radius = 3.5f }),
                new[] { new Vec2(-20f, 14f), new Vec2(-36f, 6f) });

            // --- Árvores gigantes (sumaúmas) e rochas.
            AddMirrored(m, (x, y) => m.Obstacles.Add(Obstacle.Circle("Sumaúma", new Vec2(x, y), 2.6f, "arvore_gigante")),
                new[] { new Vec2(-20f, -26f), new Vec2(-36f, -20f), new Vec2(-15f, -13f), new Vec2(-44f, 16f), new Vec2(-28f, 22f), new Vec2(-30f, -38f) });
            AddMirrored(m, (x, y) => m.Obstacles.Add(Obstacle.Circle("Árvore", new Vec2(x, y), 1.4f, "arvore")),
                new[] { new Vec2(-16f, -32f), new Vec2(-40f, -32f), new Vec2(-46f, -10f), new Vec2(-46f, 10f), new Vec2(-24f, 4f), new Vec2(-14f, 36f), new Vec2(-38f, 36f), new Vec2(-6f, -26f) });
            AddMirrored(m, (x, y) => m.Obstacles.Add(Obstacle.Circle("Rocha", new Vec2(x, y), 1.8f, "rocha")),
                new[] { new Vec2(-12f, 24f), new Vec2(-30f, 30f), new Vec2(-34f, -6f) });

            // --- Ruínas (centro): muros de pedra antiga que formam o santuário do Coração.
            m.Obstacles.Add(Obstacle.Box("Muro Norte Oeste", new Vec2(-7f, 9f), new Vec2(4f, 0.8f)));
            m.Obstacles.Add(Obstacle.Box("Muro Norte Leste", new Vec2(7f, 9f), new Vec2(4f, 0.8f)));
            m.Obstacles.Add(Obstacle.Box("Muro Sul Oeste", new Vec2(-7f, -9f), new Vec2(4f, 0.8f)));
            m.Obstacles.Add(Obstacle.Box("Muro Sul Leste", new Vec2(7f, -9f), new Vec2(4f, 0.8f)));
            AddMirrored(m, (x, y) => m.Obstacles.Add(Obstacle.Box("Pilar", new Vec2(x, y), new Vec2(1f, 1f), "pilar")),
                new[] { new Vec2(-12f, 4f), new Vec2(-12f, -4f) });
            // Raízes Antigas (evento): fecham as passagens norte e sul do santuário.
            m.Obstacles.Add(new Obstacle { Name = "Raízes Antigas Norte", IsBox = true, Center = new Vec2(0f, 9f), HalfExtents = new Vec2(3.2f, 0.9f), Active = false, VisualTag = "raizes" });
            m.Obstacles.Add(new Obstacle { Name = "Raízes Antigas Sul", IsBox = true, Center = new Vec2(0f, -9f), HalfExtents = new Vec2(3.2f, 0.9f), Active = false, VisualTag = "raizes" });

            // --- Marcos de Memória: um por região, cada um com característica própria.
            m.Marcos.Add(new MarcoSpec { Name = "Marco das Águas", Kind = MarcoKind.Aguas, Position = new Vec2(0f, 30f), Radius = 5.5f });
            m.Marcos.Add(new MarcoSpec { Name = "Marco das Ruínas", Kind = MarcoKind.Ruinas, Position = new Vec2(0f, 0f), Radius = 5f });
            m.Marcos.Add(new MarcoSpec { Name = "Marco da Mata", Kind = MarcoKind.Mata, Position = new Vec2(0f, -30f), Radius = 5.5f });

            // --- Pontos de Ecos Espirituais (espelhados).
            AddMirrored(m, (x, y) => m.EchoSpawnPoints.Add(new Vec2(x, y)),
                new[] { new Vec2(-40f, 26f), new Vec2(-22f, 30f), new Vec2(-8f, 18f), new Vec2(-36f, 0f), new Vec2(-20f, -6f), new Vec2(-18f, 10f),
                        new Vec2(-42f, -26f), new Vec2(-26f, -34f), new Vec2(-12f, -20f), new Vec2(-4f, -38f) });
            m.EchoSpawnPoints.Add(new Vec2(0f, 15f));
            m.EchoSpawnPoints.Add(new Vec2(0f, -15f));

            m.SpiritSpawnPoints.Add(new Vec2(-4f, 4f));
            m.SpiritSpawnPoints.Add(new Vec2(4f, -4f));
            m.SpiritSpawnPoints.Add(new Vec2(-16f, 0f));
            m.SpiritSpawnPoints.Add(new Vec2(16f, 0f));
            return m;
        }

        /// <summary>
        /// Arena de Teste: chão plano e vazio (40 x 40 m), sem objetivos, com uma poça d'água e uma moita
        /// para testar interações de terreno. Usada pelo modo Treinamento com o boneco de teste.
        /// </summary>
        public static MapLayout CreateArenaDeTeste()
        {
            var m = new MapLayout
            {
                Id = ArenaDeTeste,
                DisplayName = "Arena de Teste",
                Min = new Vec2(-20f, -20f),
                Max = new Vec2(20f, 20f),
                HeartPosition = Vec2.Zero,
                BaseRadius = 0f,
            };
            m.BaseCenter[(int)Team.Aurora] = new Vec2(-10f, 0f);
            m.BaseCenter[(int)Team.Crepusculo] = new Vec2(10f, 0f);
            m.Areas.Add(new TerrainArea { Kind = TerrainKind.Agua, Name = "Poça", Center = new Vec2(0f, 12f), Radius = 4f });
            m.Areas.Add(new TerrainArea { Kind = TerrainKind.Vegetacao, Name = "Moita", Center = new Vec2(0f, -12f), Radius = 3.5f });
            return m;
        }

        private static void AddMirrored(MapLayout m, System.Action<float, float> add, Vec2[] westPoints)
        {
            foreach (var p in westPoints)
            {
                add(p.X, p.Y);
                add(-p.X, p.Y);
            }
        }
    }
}
