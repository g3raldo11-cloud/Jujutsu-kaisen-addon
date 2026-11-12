"""Simulação de fogo e fumaça em grade (numpy/scipy) gravada como OpenVDB para o Cycles.

O Mantaflow (simulador do Blender) não funciona nas versões usadas aqui, então o fogo dos renders é
simulado por este módulo: fluido incompressível em grade regular com

* advecção semi-lagrangiana com correção BFECC (menos borrão, chamas mais definidas);
* empuxo pelo calor, peso da fumaça, confinamento de vorticidade (os redemoinhos das chamas);
* combustão: o emissor solta combustível, que queima liberando calor, chama e fuligem;
* projeção de pressão exata por transformada de cosseno (paredes de Neumann) e camada de
  absorção no topo, para a fumaça sair do domínio em vez de acumular.

O resultado (grades ``density``, ``flame`` e ``temperature``) vira um objeto de volume no Blender
com material de fogo. Precisa do módulo ``openvdb`` que vem com o Blender 4.2+ (no módulo ``bpy`` do
PyPI ele fica dentro do pacote); sem ele ``available()`` devolve False e os renders usam o fogo
procedural de ``fx.py``.
"""
import glob
import os
import sys
import time

import numpy as np
from scipy import fft, ndimage

_VDB = None

try:                                    # opcional: com numba a advecção roda em paralelo (~10x mais rápido)
    from numba import njit, prange

    @njit(inline='always', fastmath=True)
    def _tri(f, x, y, z, clamp):
        nx, ny, nz = f.shape
        if clamp:
            x = min(max(x, 0.0), nx - 1.0)
            y = min(max(y, 0.0), ny - 1.0)
            z = min(max(z, 0.0), nz - 1.0)
        elif x < 0.0 or y < 0.0 or z < 0.0 or x > nx - 1.0 or y > ny - 1.0 or z > nz - 1.0:
            return 0.0, 0.0, 0.0
        i0 = min(int(x), nx - 2)
        j0 = min(int(y), ny - 2)
        k0 = min(int(z), nz - 2)
        fx = x - i0
        fy = y - j0
        fz = z - k0
        c000 = f[i0, j0, k0]
        c100 = f[i0 + 1, j0, k0]
        c010 = f[i0, j0 + 1, k0]
        c110 = f[i0 + 1, j0 + 1, k0]
        c001 = f[i0, j0, k0 + 1]
        c101 = f[i0 + 1, j0, k0 + 1]
        c011 = f[i0, j0 + 1, k0 + 1]
        c111 = f[i0 + 1, j0 + 1, k0 + 1]
        a = (c000 * (1 - fx) + c100 * fx) * (1 - fy) + (c010 * (1 - fx) + c110 * fx) * fy
        b = (c001 * (1 - fx) + c101 * fx) * (1 - fy) + (c011 * (1 - fx) + c111 * fx) * fy
        lo = min(min(min(c000, c100), min(c010, c110)), min(min(c001, c101), min(c011, c111)))
        hi = max(max(max(c000, c100), max(c010, c110)), max(max(c001, c101), max(c011, c111)))
        return a * (1 - fz) + b * fz, lo, hi

    @njit(parallel=True, fastmath=True, cache=True)
    def _adv_nb(f, u, k, out, clamp):
        nx, ny, nz = f.shape
        for i in prange(nx):
            for j in range(ny):
                for l in range(nz):
                    v, lo, hi = _tri(f, i - k * u[0, i, j, l], j - k * u[1, i, j, l], l - k * u[2, i, j, l], clamp)
                    out[i, j, l] = v

    @njit(parallel=True, fastmath=True, cache=True)
    def _adv_lim_nb(g, f, u, k, out):
        # amostra g na posição de origem e limita aos valores de f em volta (BFECC sem oscilação)
        nx, ny, nz = f.shape
        for i in prange(nx):
            for j in range(ny):
                for l in range(nz):
                    x = i - k * u[0, i, j, l]
                    y = j - k * u[1, i, j, l]
                    z = l - k * u[2, i, j, l]
                    v, a, b = _tri(g, x, y, z, False)
                    w, lo, hi = _tri(f, x, y, z, False)
                    out[i, j, l] = min(max(v, lo), hi)

    NUMBA = True
except Exception:                      # pragma: no cover - sem numba usa o scipy
    NUMBA = False


def _openvdb():
    global _VDB
    if _VDB is not None:
        return _VDB or None
    try:
        import openvdb as vdb
    except ImportError:
        vdb = None
        try:
            import bpy
            base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(bpy.__file__))))
            for sp in glob.glob(os.path.join(base, 'python', 'lib', 'python3*', 'site-packages')):
                if sp not in sys.path:
                    sys.path.append(sp)
            import openvdb as vdb  # noqa: F811
        except Exception:
            vdb = None
    _VDB = vdb or False
    return vdb


def available():
    return _openvdb() is not None


class Fire:
    """Domínio de fogo. ``origin`` = canto mínimo (metros, mundo), ``size`` = extensão, ``h`` = voxel."""

    def __init__(self, origin, size, h, seed=0, buoyancy=5.5, smoke_weight=0.6, vorticity=2.2, burn_rate=7.0,
                 heat=2.4, smoke=0.55, cooling=2.2, flame_decay=7.0, dissolve=0.35, drag=0.4, wind=(0, 0, 0),
                 turbulence=1.5, turb_scale=0.05):
        self.o = np.asarray(origin, np.float64)
        self.h = float(h)
        self.n = tuple(max(8, int(round(s / h))) for s in size)
        nx, ny, nz = self.n
        f = np.float32
        self.u = np.zeros((3, nx, ny, nz), f)
        self.T = np.zeros(self.n, f)
        self.d = np.zeros(self.n, f)
        self.fuel = np.zeros(self.n, f)
        self.flame = np.zeros(self.n, f)
        self.I = np.indices(self.n, dtype=f)
        self.rng = np.random.default_rng(seed)
        self.p = dict(buoyancy=buoyancy, smoke_weight=smoke_weight, vorticity=vorticity, burn_rate=burn_rate, heat=heat,
                      smoke=smoke, cooling=cooling, flame_decay=flame_decay, dissolve=dissolve, drag=drag,
                      turbulence=turbulence, turb_scale=turb_scale)
        self._turb = None
        self._turb_next = None
        self.wind = np.asarray(wind, f)
        # autovalores do laplaciano compacto com paredes de Neumann (base de cossenos DCT-II)
        lam = [2.0 * (np.cos(np.pi * np.arange(k) / k) - 1.0) / self.h ** 2 for k in self.n]
        L = lam[0][:, None, None] + lam[1][None, :, None] + lam[2][None, None, :]
        L[0, 0, 0] = 1.0
        self.Linv = (1.0 / L).astype(f)
        self.Linv[0, 0, 0] = 0.0
        # camada de absorção no topo (saída aberta) e nas laterais (amortece reflexo nas paredes)
        z = np.arange(nz) / (nz - 1)
        top = np.clip((z - 0.82) / 0.18, 0, 1)
        self.sponge_z = (1.0 - top ** 2)[None, None, :].astype(f)
        self.emitters = []
        self.forces = []
        self.time = 0.0

    # ------------------------------------------------------------------ emissores
    def _index(self, P):
        return (np.asarray(P, np.float64) - self.o) / self.h

    def add_points(self, P, radius, fuel=1.0, temp=1.0, vel=None, weights=None, flicker=0.6, jitter=0.0, smoke=0.0):
        """Emissor feito de pontos (ex.: vértices das mechas de cabelo, borda das escamas).
        ``vel``: velocidade inicial por ponto (N x 3) ou única (3,). ``flicker``: quanto a vazão oscila.
        ``smoke``: fumaça/poeira emitida direto (sem queimar), para fumaça de cachimbo e poeira."""
        P = np.asarray(P, np.float64).reshape(-1, 3)
        w = np.ones(len(P)) if weights is None else np.asarray(weights, np.float64)
        if vel is None:
            V = np.zeros((len(P), 3))
        else:
            V = np.broadcast_to(np.asarray(vel, np.float64), (len(P), 3)).copy()
        self.emitters.append(dict(P=P, w=w, V=V, sigma=max(0.6, radius / self.h), fuel=fuel, temp=temp, smoke=smoke,
                                  flicker=flicker, jitter=jitter, phase=self.rng.uniform(0, 6.283, len(P)),
                                  freq=self.rng.uniform(5.0, 13.0, len(P))))

    def _splat(self, P, w, sigma):
        idx = np.rint(self._index(P)).astype(np.int64)
        ok = np.all((idx >= 0) & (idx < np.array(self.n)), axis=1)
        g = np.zeros(self.n, np.float32)
        np.add.at(g, tuple(idx[ok].T), w[ok].astype(np.float32))
        return ndimage.gaussian_filter(g, sigma, mode='constant', truncate=2.5)

    def _emit(self, dt):
        for e in self.emitters:
            t = self.time
            amp = 1.0 - e['flicker'] * 0.5 * (1.0 + np.sin(e['freq'] * t + e['phase']))
            P = e['P']
            if e['jitter']:
                P = P + self.rng.normal(0, e['jitter'], P.shape)
            m = self._splat(P, e['w'] * amp, e['sigma'])
            peak = float(m.max())
            if peak <= 0:
                continue
            m /= max(peak, 1e-6)
            if e['fuel']:
                self.fuel += m * (e['fuel'] * dt * 8.0)
            if e['smoke']:
                self.d += m * (e['smoke'] * dt * 8.0)
            if e['temp']:
                np.maximum(self.T, m * e['temp'], out=self.T)
            if np.any(e['V']):
                wsum = m + 1e-6
                for a in range(3):
                    va = self._splat(P, e['w'] * amp * e['V'][:, a], e['sigma'])
                    va /= max(peak, 1e-6)
                    k = np.clip(m * 1.5, 0, 1)
                    self.u[a] = self.u[a] * (1 - k) + (va / wsum) * k

    def add_vortex(self, center, radius, swirl, updraft=0.0, inflow=0.0, height=None, axis_tilt=(0.0, 0.0), rate=4.0):
        """Redemoinho: puxa a velocidade para um vórtice de Rankine em volta de um eixo vertical
        (giro máximo em ``radius``), com subida no miolo e entrada de ar rente ao chão."""
        nx, ny, nz = self.n
        x = (np.arange(nx) * self.h + self.o[0])[:, None, None]
        y = (np.arange(ny) * self.h + self.o[1])[None, :, None]
        z = (np.arange(nz) * self.h + self.o[2])[None, None, :]
        zz = z - self.o[2]
        cx = center[0] + axis_tilt[0] * zz
        cy = center[1] + axis_tilt[1] * zz
        dx, dy = x - cx, y - cy
        r = np.sqrt(dx * dx + dy * dy) + 1e-6
        vt = swirl * np.where(r < radius, r / radius, (radius / r) ** 0.8)
        H = height or (nz * self.h)
        fall = np.exp(-(zz / H) ** 2 * 1.5)
        tx, ty = -dy / r, dx / r
        target = np.zeros((3, nx, ny, nz), np.float32)
        target[0] = (tx * vt - inflow * dx / r * np.exp(-zz / 0.25) * np.clip(r / radius, 0, 1.5)) * fall
        target[1] = (ty * vt - inflow * dy / r * np.exp(-zz / 0.25) * np.clip(r / radius, 0, 1.5)) * fall
        target[2] = updraft * np.exp(-(r / (radius * 1.2)) ** 2) * fall
        self.forces.append((target, rate))

    # ------------------------------------------------------------------ passos
    def _advect(self, field, k, clamp=False):
        """Semi-lagrangiana: valor vem de x - k*u (k = dt/h; negativo = para trás no tempo)."""
        if NUMBA:
            out = np.empty_like(field)
            _adv_nb(field, self.u, np.float32(k), out, clamp)
            return out
        coords = self.I - np.float32(k) * self.u
        return ndimage.map_coordinates(field, coords, order=1, mode='nearest' if clamp else 'constant', cval=0.0,
                                       prefilter=False).astype(np.float32)

    def _bfecc(self, field, k):
        a = self._advect(field, k)
        b = self._advect(a, -k)
        corr = field + 0.5 * (field - b)
        if NUMBA:
            out = np.empty_like(field)
            _adv_lim_nb(corr, field, self.u, np.float32(k), out)
            return out
        c = self._advect(corr, k)
        lo = self._advect(ndimage.minimum_filter(field, size=2, origin=-1), k)
        hi = self._advect(ndimage.maximum_filter(field, size=2, origin=-1), k)
        return np.clip(c, lo, hi)

    def _curl(self, u):
        h = self.h
        dw_dy = np.gradient(u[2], h, axis=1)
        dv_dz = np.gradient(u[1], h, axis=2)
        du_dz = np.gradient(u[0], h, axis=2)
        dw_dx = np.gradient(u[2], h, axis=0)
        dv_dx = np.gradient(u[1], h, axis=0)
        du_dy = np.gradient(u[0], h, axis=1)
        return np.stack([dw_dy - dv_dz, du_dz - dw_dx, dv_dx - du_dy])

    def _turbulence(self, dt):
        """Força aleatória de baixa frequência que muda com o tempo (chamas tremulando)."""
        p = self.p
        c = max(2, int(round(p['turb_scale'] / self.h)))
        shape = tuple(max(3, n // c + 2) for n in self.n)

        def field():
            return self.rng.normal(0, 1, (3,) + shape).astype(np.float32)

        if self._turb is None:
            self._turb, self._turb_next, self._turb_t = field(), field(), 0.0
        self._turb_t += dt * 6.0
        if self._turb_t >= 1.0:
            self._turb, self._turb_next, self._turb_t = self._turb_next, field(), 0.0
        lowres = self._turb * (1 - self._turb_t) + self._turb_next * self._turb_t
        zoom = [n / s for n, s in zip(self.n, shape)]
        return np.stack([ndimage.zoom(lowres[a], zoom, order=1)[:self.n[0], :self.n[1], :self.n[2]] for a in range(3)]) * p['turbulence']

    def _project(self):
        h = self.h
        u = self.u
        div = np.gradient(u[0], h, axis=0) + np.gradient(u[1], h, axis=1) + np.gradient(u[2], h, axis=2)
        ph = fft.dctn(div, type=2, norm='ortho', workers=-1)
        ph *= self.Linv
        p = fft.idctn(ph, type=2, norm='ortho', workers=-1).astype(np.float32)
        for a in range(3):
            u[a] -= np.gradient(p, h, axis=a)

    def step(self, dt):
        p = self.p
        self._emit(dt)
        # combustão
        burn = self.fuel * np.float32(1.0 - np.exp(-p['burn_rate'] * dt))
        burn *= (self.T > 0.12)
        self.fuel -= burn
        self.T += burn * p['heat']
        self.d += burn * p['smoke']
        self.flame = np.maximum(self.flame * np.float32(np.exp(-p['flame_decay'] * dt)), np.clip(burn / (dt * 2.5), 0, 1.6))
        # forças
        u = self.u
        u[2] += dt * (p['buoyancy'] * self.T - p['smoke_weight'] * self.d)
        if p['vorticity'] > 0:
            w = self._curl(u)
            wm = np.sqrt((w ** 2).sum(0)) + 1e-6
            g = np.stack(np.gradient(wm, self.h))
            g /= np.sqrt((g ** 2).sum(0)) + 1e-6
            fconf = np.cross(g, w, axis=0) * (p['vorticity'] * self.h)
            u += dt * fconf
        if p['turbulence'] > 0:
            u += dt * self._turbulence(dt) * np.clip(self.T * 4.0, 0, 1)[None]
        for target, rate in self.forces:
            u += (target - u) * np.float32(1.0 - np.exp(-rate * dt))
        u += dt * self.wind[:, None, None, None]
        u *= np.float32(np.exp(-p['drag'] * dt))
        u *= self.sponge_z
        self._project()
        # advecção (escalares com BFECC pelo campo já projetado; depois a própria velocidade)
        k = dt / self.h
        self.T = self._bfecc(self.T, k)
        self.d = self._bfecc(self.d, k)
        self.fuel = self._advect(self.fuel, k)
        self.flame = self._bfecc(self.flame, k)
        self.u = np.stack([self._advect(self.u[a], k, True) for a in range(3)])
        # resfriamento, dissipação e saída pelo topo
        self.T *= np.float32(np.exp(-p['cooling'] * dt))
        self.d *= np.float32(np.exp(-p['dissolve'] * dt))
        self.T *= self.sponge_z
        self.d *= self.sponge_z
        self.flame *= self.sponge_z
        np.clip(self.T, 0, 6, out=self.T)
        np.clip(self.d, 0, 4, out=self.d)
        self.time += dt

    def run(self, seconds, dt=1.0 / 60.0, label='fogo'):
        t0 = time.time()
        n = int(round(seconds / dt))
        for i in range(n):
            self.step(dt)
        print(f'FOGO {label}: {self.n} voxels {np.prod(self.n) / 1e6:.2f} M, {n} passos, {time.time() - t0:.1f} s,'
              f' chama máx {float(self.flame.max()):.2f}, fumaça máx {float(self.d.max()):.2f}')
        return self

    # ------------------------------------------------------------------ saída
    def write_vdb(self, path, smoke_scale=1.0):
        vdb = _openvdb()
        grids = []
        for name, arr, tol in (('density', self.d * smoke_scale, 0.004), ('flame', self.flame, 0.004),
                               ('temperature', self.T, 0.01)):
            g = vdb.FloatGrid()
            g.copyFromArray(np.ascontiguousarray(arr, np.float32), (0, 0, 0), tol)
            g.name = name
            g.transform = vdb.createLinearTransform(voxelSize=self.h)
            grids.append(g)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        vdb.write(path, grids=grids)
        return path


# ====================================================================== no Blender
def fire_material(name, strength=6.0, smoke=2.0, smoke_color=(0.03, 0.028, 0.026), stops=None, temp_glow=0.0):
    """Material do volume simulado: fuligem escura espalhando luz + emissão pela chama (rampa de cor de
    fogo de verdade: vermelho escuro nas bordas, laranja, amarelo e quase branco no miolo)."""
    import bpy
    from . import fx
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    pv = nt.nodes.new('ShaderNodeVolumePrincipled')
    at_d = nt.nodes.new('ShaderNodeAttribute')
    at_d.attribute_name = 'density'
    at_f = nt.nodes.new('ShaderNodeAttribute')
    at_f.attribute_name = 'flame'
    at_t = nt.nodes.new('ShaderNodeAttribute')
    at_t.attribute_name = 'temperature'
    fl = at_f.outputs['Fac']
    nt.links.new(fx._math(nt, 'MULTIPLY', at_d.outputs['Fac'], smoke), pv.inputs['Density'])
    pv.inputs['Color'].default_value = (*smoke_color, 1)
    pv.inputs['Absorption Color'].default_value = (0.0, 0.0, 0.0, 1)
    pv.inputs['Anisotropy'].default_value = 0.3
    stops = stops or [(0.0, (0.0, 0.0, 0.0)), (0.18, (0.0, 0.0, 0.0)), (0.3, (0.45, 0.03, 0.0)), (0.48, (1.0, 0.17, 0.01)),
                      (0.7, (1.0, 0.45, 0.06)), (0.88, (1.0, 0.75, 0.3)), (1.0, (1.0, 0.93, 0.72))]
    heat = fx._math(nt, 'MULTIPLY', fl, 0.9, clamp=True)
    if temp_glow:
        heat = fx._math(nt, 'MAXIMUM', heat, fx._math(nt, 'MULTIPLY', at_t.outputs['Fac'], temp_glow, clamp=True))
    nt.links.new(fx._ramp(nt, heat, stops), pv.inputs['Emission Color'])
    # brilho cresce rápido com o calor; o que é só fumaça morna não brilha
    glow = fx._math(nt, 'MULTIPLY', fx._math(nt, 'SUBTRACT', heat, 0.2, clamp=True), 1.25)
    nt.links.new(fx._math(nt, 'MULTIPLY', fx._math(nt, 'POWER', glow, 1.5), strength), pv.inputs['Emission Strength'])
    nt.links.new(pv.outputs[0], out.inputs['Volume'])
    return m


def smoke_material(name, density=3.0, color=(0.75, 0.74, 0.72), anisotropy=0.55, emission=None, emission_strength=0.0):
    """Fumaça ou poeira (só espalha luz; ``anisotropy`` alta = brilha contra o sol). Com ``emission``,
    a própria fumaça brilha (vapor da perna de vento do Saci)."""
    import bpy
    from . import fx
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    pv = nt.nodes.new('ShaderNodeVolumePrincipled')
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 'density'
    dens = fx._math(nt, 'MULTIPLY', at.outputs['Fac'], density)
    nt.links.new(dens, pv.inputs['Density'])
    pv.inputs['Color'].default_value = (*color, 1)
    pv.inputs['Anisotropy'].default_value = anisotropy
    if emission is not None:
        pv.inputs['Emission Color'].default_value = (*emission, 1)
        nt.links.new(fx._math(nt, 'MULTIPLY', fx._math(nt, 'POWER', at.outputs['Fac'], 0.8), emission_strength),
                     pv.inputs['Emission Strength'])
    nt.links.new(pv.outputs[0], out.inputs['Volume'])
    return m


def volume_object(name, path, origin, mat, col=None):
    import bpy
    from . import kit
    vol = bpy.data.volumes.new(name)
    vol.filepath = path
    vol.grids.load()
    vol.materials.append(mat)
    ob = bpy.data.objects.new(name, vol)
    (col or kit.collection('Efeitos')).objects.link(ob)
    ob.location = tuple(origin)
    ob.visible_shadow = False
    return ob


def simulate(name, origin, size, h, emit, seconds=2.0, dt=1.0 / 60.0, folder=None, mat=None, seed=0, **params):
    """Atalho: cria o domínio, chama ``emit(fire)`` para pôr os emissores, simula, grava e carrega.
    A simulação fica em cache (.vdb com uma impressão digital de domínio, emissores e parâmetros):
    renderizar de novo a mesma cena, em outra resolução ou câmera, não simula outra vez."""
    import hashlib
    fire = Fire(origin, size, h, seed=seed, **params)
    emit(fire)
    hs = hashlib.sha1()
    hs.update(repr((name, tuple(np.round(fire.o, 6)), fire.n, round(fire.h, 7), seconds, dt, seed, sorted(params.items()))).encode())
    for e in fire.emitters:
        for k in ('P', 'w', 'V'):
            hs.update(np.ascontiguousarray(np.round(e[k], 6)).tobytes())
        hs.update(repr((e['sigma'], e['fuel'], e['temp'], e['smoke'], e['flicker'], e['jitter'])).encode())
    for target, rate in fire.forces:
        hs.update(np.ascontiguousarray(target[:, ::4, ::4, ::4]).tobytes())
        hs.update(repr(rate).encode())
    folder = folder or os.path.join(os.environ.get('LENDAS_CACHE', os.path.join(os.path.dirname(__file__), '..', 'cache')))
    path = os.path.join(os.path.abspath(folder), f'{name}_{hs.hexdigest()[:12]}.vdb')
    if os.path.exists(path):
        print(f'FOGO {name}: cache {os.path.basename(path)}')
    else:
        fire.run(seconds, dt, name)
        fire.write_vdb(path)
    ob = volume_object(name, path, fire.o, mat or fire_material(name + '_mat'))
    return ob, fire
