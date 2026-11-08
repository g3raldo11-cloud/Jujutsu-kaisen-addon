using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>Obstáculo de colisão: círculo (árvores gigantes, rochas) ou caixa alinhada (muros de ruínas).</summary>
    public sealed class Obstacle
    {
        public string Name;
        public bool IsBox;
        public Vec2 Center;
        public float Radius;      // círculo
        public Vec2 HalfExtents;  // caixa
        /// <summary>Obstáculos dinâmicos (ex.: Raízes Antigas) só colidem quando ativos.</summary>
        public bool Active = true;
        /// <summary>Árvore gigante: usada pela apresentação para escolher o modelo.</summary>
        public string VisualTag;

        public static Obstacle Circle(string name, Vec2 c, float r, string tag = "arvore") =>
            new Obstacle { Name = name, Center = c, Radius = r, VisualTag = tag };
        public static Obstacle Box(string name, Vec2 c, Vec2 half, string tag = "ruina") =>
            new Obstacle { Name = name, IsBox = true, Center = c, HalfExtents = half, VisualTag = tag };

        public bool Contains(Vec2 p, float inflate)
        {
            if (!Active) return false;
            if (!IsBox) return Vec2.SqrDistance(p, Center) < (Radius + inflate) * (Radius + inflate);
            return MathF.Abs(p.X - Center.X) < HalfExtents.X + inflate && MathF.Abs(p.Y - Center.Y) < HalfExtents.Y + inflate;
        }

        /// <summary>Empurra um círculo para fora do obstáculo.</summary>
        public Vec2 PushOut(Vec2 p, float radius)
        {
            if (!Active) return p;
            if (!IsBox)
            {
                Vec2 d = p - Center;
                float min = Radius + radius;
                float len = d.Length;
                if (len >= min) return p;
                if (len < 1e-4f) d = Vec2.Right; else d = d / len;
                return Center + d * min;
            }
            Vec2 local = p - Center;
            float cx = MathUtil.Clamp(local.X, -HalfExtents.X, HalfExtents.X);
            float cy = MathUtil.Clamp(local.Y, -HalfExtents.Y, HalfExtents.Y);
            Vec2 closest = new Vec2(cx, cy);
            Vec2 diff = local - closest;
            float dist = diff.Length;
            if (dist >= radius) return p;
            if (dist > 1e-4f) return Center + closest + diff / dist * radius;
            // Centro dentro da caixa: sai pelo lado mais próximo.
            float dx = HalfExtents.X - MathF.Abs(local.X);
            float dy = HalfExtents.Y - MathF.Abs(local.Y);
            if (dx < dy) return new Vec2(Center.X + MathF.Sign(local.X == 0 ? 1 : local.X) * (HalfExtents.X + radius), p.Y);
            return new Vec2(p.X, Center.Y + MathF.Sign(local.Y == 0 ? 1 : local.Y) * (HalfExtents.Y + radius));
        }
    }

    /// <summary>Região de terreno (água, vegetação) definida por retângulos e círculos.</summary>
    public sealed class TerrainArea
    {
        public TerrainKind Kind;
        public string Name;
        public bool IsBox;
        public Vec2 Center;
        public float Radius;
        public Vec2 HalfExtents;
        /// <summary>Áreas que só existem durante um evento ambiental (ex.: Cheia do Rio).</summary>
        public bool Active = true;
        public string EventTag;

        public bool Contains(Vec2 p)
        {
            if (!Active) return false;
            if (!IsBox) return Vec2.SqrDistance(p, Center) <= Radius * Radius;
            return MathF.Abs(p.X - Center.X) <= HalfExtents.X && MathF.Abs(p.Y - Center.Y) <= HalfExtents.Y;
        }
    }

    public enum MapRegion { Rio, Ruinas, Mata }

    public sealed class MarcoSpec
    {
        public string Name;
        public MarcoKind Kind;
        public Vec2 Position;
        public float Radius;
    }

    public enum MarcoKind { Aguas, Ruinas, Mata }

    /// <summary>Descrição completa e independente de engine de um mapa competitivo 5v5.</summary>
    public sealed class MapLayout
    {
        public string Id;
        public string DisplayName;
        public Vec2 Min;
        public Vec2 Max;
        public readonly List<Obstacle> Obstacles = new List<Obstacle>();
        public readonly List<TerrainArea> Areas = new List<TerrainArea>();
        public readonly List<MarcoSpec> Marcos = new List<MarcoSpec>();
        public readonly List<Vec2> EchoSpawnPoints = new List<Vec2>();
        public readonly List<Vec2> SpiritSpawnPoints = new List<Vec2>();
        public Vec2 HeartPosition;
        public float HeartRadius = 6.5f;
        public Vec2[] BaseCenter = new Vec2[2];
        public float BaseRadius = 7f;

        public bool InBounds(Vec2 p, float margin = 0f) =>
            p.X >= Min.X + margin && p.X <= Max.X - margin && p.Y >= Min.Y + margin && p.Y <= Max.Y - margin;

        public Vec2 ClampToBounds(Vec2 p, float margin) =>
            new Vec2(MathUtil.Clamp(p.X, Min.X + margin, Max.X - margin), MathUtil.Clamp(p.Y, Min.Y + margin, Max.Y - margin));

        public bool IsBlocked(Vec2 p, float radius)
        {
            if (!InBounds(p, radius)) return true;
            for (int i = 0; i < Obstacles.Count; i++) if (Obstacles[i].Contains(p, radius)) return true;
            return false;
        }

        public TerrainKind TerrainAt(Vec2 p)
        {
            // Água tem prioridade sobre vegetação (vegetação alagada vira água).
            bool veg = false;
            for (int i = 0; i < Areas.Count; i++)
            {
                if (!Areas[i].Contains(p)) continue;
                if (Areas[i].Kind == TerrainKind.Agua) return TerrainKind.Agua;
                if (Areas[i].Kind == TerrainKind.Vegetacao) veg = true;
            }
            return veg ? TerrainKind.Vegetacao : TerrainKind.Solo;
        }

        public MapRegion RegionAt(Vec2 p)
        {
            if (p.Y > 12f) return MapRegion.Rio;
            if (p.Y < -12f) return MapRegion.Mata;
            return MapRegion.Ruinas;
        }

        /// <summary>Teste de linha de visão contra obstáculos ativos (usado por habilidades e bots).</summary>
        public bool HasLineOfSight(Vec2 a, Vec2 b)
        {
            float dist = Vec2.Distance(a, b);
            int steps = Math.Max(1, (int)(dist / 0.75f));
            for (int i = 1; i < steps; i++)
            {
                Vec2 p = Vec2.Lerp(a, b, i / (float)steps);
                for (int o = 0; o < Obstacles.Count; o++)
                    if (Obstacles[o].Contains(p, -0.2f)) return false;
            }
            return true;
        }
    }
}
