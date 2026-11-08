using System;

namespace Lendas.Core
{
    /// <summary>
    /// Vetor 2D no plano do chão (X = leste, Y = norte). A simulação é independente da Unity
    /// para poder rodar em um servidor autoritativo e em testes automatizados.
    /// A camada de apresentação converte para Vector3(x, altura, y).
    /// </summary>
    [Serializable]
    public struct Vec2 : IEquatable<Vec2>
    {
        public float X;
        public float Y;

        public Vec2(float x, float y) { X = x; Y = y; }

        public static readonly Vec2 Zero = new Vec2(0f, 0f);
        public static readonly Vec2 Up = new Vec2(0f, 1f);
        public static readonly Vec2 Right = new Vec2(1f, 0f);

        public float Length => MathF.Sqrt(X * X + Y * Y);
        public float SqrLength => X * X + Y * Y;

        public Vec2 Normalized
        {
            get
            {
                float len = Length;
                return len > 1e-5f ? new Vec2(X / len, Y / len) : Zero;
            }
        }

        public Vec2 Perpendicular => new Vec2(-Y, X);

        public static Vec2 operator +(Vec2 a, Vec2 b) => new Vec2(a.X + b.X, a.Y + b.Y);
        public static Vec2 operator -(Vec2 a, Vec2 b) => new Vec2(a.X - b.X, a.Y - b.Y);
        public static Vec2 operator -(Vec2 a) => new Vec2(-a.X, -a.Y);
        public static Vec2 operator *(Vec2 a, float s) => new Vec2(a.X * s, a.Y * s);
        public static Vec2 operator *(float s, Vec2 a) => new Vec2(a.X * s, a.Y * s);
        public static Vec2 operator /(Vec2 a, float s) => new Vec2(a.X / s, a.Y / s);
        public static bool operator ==(Vec2 a, Vec2 b) => a.X == b.X && a.Y == b.Y;
        public static bool operator !=(Vec2 a, Vec2 b) => !(a == b);

        public static float Dot(Vec2 a, Vec2 b) => a.X * b.X + a.Y * b.Y;
        public static float Cross(Vec2 a, Vec2 b) => a.X * b.Y - a.Y * b.X;
        public static float Distance(Vec2 a, Vec2 b) => (a - b).Length;
        public static float SqrDistance(Vec2 a, Vec2 b) => (a - b).SqrLength;
        public static Vec2 Lerp(Vec2 a, Vec2 b, float t) => a + (b - a) * t;

        public static Vec2 FromAngle(float radians) => new Vec2(MathF.Cos(radians), MathF.Sin(radians));
        public float Angle => MathF.Atan2(Y, X);

        public Vec2 Rotated(float radians)
        {
            float c = MathF.Cos(radians), s = MathF.Sin(radians);
            return new Vec2(X * c - Y * s, X * s + Y * c);
        }

        public Vec2 ClampLength(float max)
        {
            float sq = SqrLength;
            if (sq <= max * max) return this;
            return Normalized * max;
        }

        /// <summary>Ângulo entre dois vetores, em radianos (0..PI).</summary>
        public static float AngleBetween(Vec2 a, Vec2 b)
        {
            float la = a.Length, lb = b.Length;
            if (la < 1e-5f || lb < 1e-5f) return 0f;
            float d = Dot(a, b) / (la * lb);
            if (d > 1f) d = 1f; else if (d < -1f) d = -1f;
            return MathF.Acos(d);
        }

        /// <summary>Distância de um ponto a um segmento AB.</summary>
        public static float DistanceToSegment(Vec2 p, Vec2 a, Vec2 b)
        {
            Vec2 ab = b - a;
            float len2 = ab.SqrLength;
            if (len2 < 1e-6f) return Distance(p, a);
            float t = Dot(p - a, ab) / len2;
            if (t < 0f) t = 0f; else if (t > 1f) t = 1f;
            return Distance(p, a + ab * t);
        }

        public bool Equals(Vec2 other) => X == other.X && Y == other.Y;
        public override bool Equals(object obj) => obj is Vec2 v && Equals(v);
        public override int GetHashCode() => (X.GetHashCode() * 397) ^ Y.GetHashCode();
        public override string ToString() => $"({X:0.00}, {Y:0.00})";
    }

    public static class MathUtil
    {
        public static float Clamp(float v, float min, float max) => v < min ? min : (v > max ? max : v);
        public static float Clamp01(float v) => Clamp(v, 0f, 1f);
        public static float MoveTowards(float current, float target, float maxDelta)
        {
            if (MathF.Abs(target - current) <= maxDelta) return target;
            return current + MathF.Sign(target - current) * maxDelta;
        }
        public const float Deg2Rad = MathF.PI / 180f;
    }

    /// <summary>Gerador pseudoaleatório determinístico (xorshift) — o servidor e os testes reproduzem as partidas.</summary>
    public sealed class SimRandom
    {
        private uint _state;
        public SimRandom(uint seed) { _state = seed == 0 ? 0x9E3779B9u : seed; }

        public uint NextUInt()
        {
            uint x = _state;
            x ^= x << 13; x ^= x >> 17; x ^= x << 5;
            _state = x;
            return x;
        }

        public float NextFloat() => (NextUInt() & 0xFFFFFF) / (float)0x1000000;
        public float Range(float min, float max) => min + (max - min) * NextFloat();
        public int Range(int minInclusive, int maxExclusive) =>
            maxExclusive <= minInclusive ? minInclusive : minInclusive + (int)(NextUInt() % (uint)(maxExclusive - minInclusive));
        public Vec2 InsideCircle(float radius)
        {
            float a = Range(0f, MathF.PI * 2f);
            float r = radius * MathF.Sqrt(NextFloat());
            return Vec2.FromAngle(a) * r;
        }
    }
}
