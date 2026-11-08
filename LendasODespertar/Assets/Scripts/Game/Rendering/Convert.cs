using Lendas.Core;
using UnityEngine;

namespace Lendas.Game
{
    /// <summary>Conversões entre o plano da simulação (Vec2) e o mundo 3D da Unity (XZ).</summary>
    public static class Convert
    {
        public static Vector3 ToWorld(this Vec2 v, float height = 0f) => new Vector3(v.X, height, v.Y);
        public static Vec2 ToSim(this Vector3 v) => new Vec2(v.x, v.z);
        public static Quaternion FacingRotation(this Vec2 facing) =>
            facing.SqrLength > 1e-4f ? Quaternion.LookRotation(new Vector3(facing.X, 0f, facing.Y), Vector3.up) : Quaternion.identity;
    }
}
