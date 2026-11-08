using System;
using System.Collections.Generic;

namespace Lendas.Core
{
    /// <summary>
    /// Grade de navegação com A* usada pela IA no servidor (a simulação não depende da NavMesh da Unity,
    /// pois roda em servidor autoritativo e em testes). Reconstruída quando obstáculos dinâmicos mudam.
    /// </summary>
    public sealed class NavGrid
    {
        private readonly MapLayout _map;
        private readonly float _cell;
        private readonly int _w, _h;
        private bool[] _blocked;
        private readonly float _agentRadius;

        // Buffers reutilizados para evitar alocação por consulta.
        private float[] _g;
        private int[] _parent;
        private int[] _stamp;
        private bool[] _closed;
        private int _search;

        public int Width => _w;
        public int Height => _h;
        public float CellSize => _cell;
        public int Version { get; private set; }

        public NavGrid(MapLayout map, float cellSize = 1f, float agentRadius = 0.7f)
        {
            _map = map;
            _cell = cellSize;
            _agentRadius = agentRadius;
            _w = (int)MathF.Ceiling((map.Max.X - map.Min.X) / cellSize);
            _h = (int)MathF.Ceiling((map.Max.Y - map.Min.Y) / cellSize);
            _g = new float[_w * _h];
            _parent = new int[_w * _h];
            _stamp = new int[_w * _h];
            _closed = new bool[_w * _h];
            Rebuild();
        }

        public void Rebuild()
        {
            _blocked = new bool[_w * _h];
            for (int y = 0; y < _h; y++)
                for (int x = 0; x < _w; x++)
                    _blocked[y * _w + x] = _map.IsBlocked(CellCenter(x, y), _agentRadius);
            Version++;
        }

        public Vec2 CellCenter(int x, int y) => new Vec2(_map.Min.X + (x + 0.5f) * _cell, _map.Min.Y + (y + 0.5f) * _cell);

        public bool ToCell(Vec2 p, out int x, out int y)
        {
            x = (int)MathF.Floor((p.X - _map.Min.X) / _cell);
            y = (int)MathF.Floor((p.Y - _map.Min.Y) / _cell);
            return x >= 0 && y >= 0 && x < _w && y < _h;
        }

        public bool IsWalkable(int x, int y) => x >= 0 && y >= 0 && x < _w && y < _h && !_blocked[y * _w + x];

        private int NearestWalkable(Vec2 p)
        {
            ToCell(p, out int cx, out int cy);
            cx = Math.Max(0, Math.Min(_w - 1, cx));
            cy = Math.Max(0, Math.Min(_h - 1, cy));
            if (!_blocked[cy * _w + cx]) return cy * _w + cx;
            for (int r = 1; r < 12; r++)
                for (int dy = -r; dy <= r; dy++)
                    for (int dx = -r; dx <= r; dx++)
                    {
                        if (Math.Abs(dx) != r && Math.Abs(dy) != r) continue;
                        int x = cx + dx, y = cy + dy;
                        if (IsWalkable(x, y)) return y * _w + x;
                    }
            return -1;
        }

        /// <summary>Calcula um caminho suavizado de <paramref name="from"/> até <paramref name="to"/>.</summary>
        public bool FindPath(Vec2 from, Vec2 to, List<Vec2> result)
        {
            result.Clear();
            int start = NearestWalkable(from);
            int goal = NearestWalkable(to);
            if (start < 0 || goal < 0) return false;
            if (start == goal) { result.Add(to); return true; }

            _search++;
            var open = new MinHeap(256);
            _g[start] = 0f; _parent[start] = -1; _stamp[start] = _search; _closed[start] = false;
            open.Push(start, Heuristic(start, goal));
            int expanded = 0;
            while (open.Count > 0)
            {
                int cur = open.Pop();
                if (_stamp[cur] == _search && _closed[cur]) continue;
                _closed[cur] = true;
                if (cur == goal) break;
                if (++expanded > _w * _h) return false;
                int cx = cur % _w, cy = cur / _w;
                for (int dy = -1; dy <= 1; dy++)
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        int nx = cx + dx, ny = cy + dy;
                        if (!IsWalkable(nx, ny)) continue;
                        // Não cortar cantos de obstáculos.
                        if (dx != 0 && dy != 0 && (!IsWalkable(cx + dx, cy) || !IsWalkable(cx, cy + dy))) continue;
                        int n = ny * _w + nx;
                        float cost = _g[cur] + ((dx != 0 && dy != 0) ? 1.4142f : 1f);
                        if (_stamp[n] != _search) { _stamp[n] = _search; _closed[n] = false; _g[n] = float.MaxValue; }
                        if (_closed[n] || cost >= _g[n]) continue;
                        _g[n] = cost;
                        _parent[n] = cur;
                        open.Push(n, cost + Heuristic(n, goal));
                    }
            }
            if (_stamp[goal] != _search || !_closed[goal]) return false;

            var cells = new List<int>();
            for (int c = goal; c != -1; c = _parent[c]) cells.Add(c);
            cells.Reverse();

            // Suavização por linha de visão na grade.
            Vec2 anchor = from;
            int i = 0;
            while (i < cells.Count - 1)
            {
                int far = i + 1;
                for (int j = cells.Count - 1; j > i + 1; j--)
                {
                    if (Walkable(anchor, CellCenter(cells[j] % _w, cells[j] / _w))) { far = j; break; }
                }
                Vec2 p = CellCenter(cells[far] % _w, cells[far] / _w);
                result.Add(p);
                anchor = p;
                i = far;
            }
            if (result.Count > 0) result[result.Count - 1] = _map.IsBlocked(to, _agentRadius) ? result[result.Count - 1] : to;
            return true;
        }

        /// <summary>O segmento é inteiramente caminhável?</summary>
        public bool Walkable(Vec2 a, Vec2 b)
        {
            float dist = Vec2.Distance(a, b);
            int steps = Math.Max(1, (int)(dist / (_cell * 0.5f)));
            for (int s = 1; s <= steps; s++)
            {
                Vec2 p = Vec2.Lerp(a, b, s / (float)steps);
                if (!ToCell(p, out int x, out int y) || _blocked[y * _w + x]) return false;
            }
            return true;
        }

        private float Heuristic(int a, int b)
        {
            int dx = Math.Abs(a % _w - b % _w), dy = Math.Abs(a / _w - b / _w);
            return (dx + dy) + (1.4142f - 2f) * Math.Min(dx, dy);
        }

        private sealed class MinHeap
        {
            private int[] _items;
            private float[] _keys;
            public int Count;
            public MinHeap(int cap) { _items = new int[cap]; _keys = new float[cap]; }
            public void Push(int item, float key)
            {
                if (Count == _items.Length) { Array.Resize(ref _items, Count * 2); Array.Resize(ref _keys, Count * 2); }
                int i = Count++;
                _items[i] = item; _keys[i] = key;
                while (i > 0)
                {
                    int p = (i - 1) / 2;
                    if (_keys[p] <= _keys[i]) break;
                    Swap(i, p); i = p;
                }
            }
            public int Pop()
            {
                int top = _items[0];
                Count--;
                _items[0] = _items[Count]; _keys[0] = _keys[Count];
                int i = 0;
                while (true)
                {
                    int l = i * 2 + 1, r = l + 1, s = i;
                    if (l < Count && _keys[l] < _keys[s]) s = l;
                    if (r < Count && _keys[r] < _keys[s]) s = r;
                    if (s == i) break;
                    Swap(i, s); i = s;
                }
                return top;
            }
            private void Swap(int a, int b)
            {
                (_items[a], _items[b]) = (_items[b], _items[a]);
                (_keys[a], _keys[b]) = (_keys[b], _keys[a]);
            }
        }
    }
}
