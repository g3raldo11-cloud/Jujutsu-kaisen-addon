"""Anatomia masculina estilizada (pose em A), esculpida com massas musculares + pincéis de vinco.

``Body`` monta a blocagem (metaballs), as peças modeladas à parte (mãos, dedos dos pés, orelhas)
e a lista de vincos/realces aplicados depois da união voxel. Os parâmetros permitem um corpo
forte (Curupira) ou magro e atlético (Saci), com uma ou duas pernas e pés normais ou virados
para trás.
"""
import numpy as np
from math import radians, sin, cos

from . import geo
from .sculpt import Sculpt

F = np.array((0.0, -1.0, 0.0))     # frente
B = np.array((0.0, 1.0, 0.0))      # costas
UP = np.array((0.0, 0.0, 1.0))


class Body:
    def __init__(self, name, height=1.85, build=1.0, lean=1.0, legs=(True, True), feet_backward=False,
                 arm_angle=34.0, ears_pointed=0.0, gaunt=0.0):
        self.name = name
        self.h = height
        self.k = height / 1.85          # escala geral
        self.build = build              # volume muscular (1 = atlético forte)
        self.lean = lean                # 1 = normal; <1 mais magro
        self.legs = legs                # (direita +X, esquerda -X)
        self.back_feet = feet_backward
        self.arm_angle = arm_angle
        self.ears_pointed = ears_pointed
        self.gaunt = gaunt
        self.s = Sculpt(name)
        self.grooves = []               # (pontos, largura, profundidade)
        self.bumps = []                 # (centro, raio, altura)
        self.parts = []                 # gaiolas (geo.Cage) unidas no remesh
        self.extras = []                # gaiolas somadas depois do remesh (dedos: ficam separados)
        self.lm = {}                    # pontos de referência (articulações, olhos...)
        self._build()

    # ---------------------------------------------------------------- utilidades
    def P(self, x, y, z):
        return np.array((x, y, z), float) * self.k

    def m(self, p0, p1, w, d, ref=F, bulge=1.0, stiff=2.0):
        b = self.build
        self.s.muscle(p0, p1, w * self.k * (0.75 + 0.25 * b) * self.lean ** 0.5, d * self.k * (0.7 + 0.3 * b) * self.lean ** 0.5,
                      ref, False, stiff, bulge)

    def e(self, c, r, axes=None, neg=False, stiff=2.0, scale_build=True):
        r = np.asarray(r, float) * self.k
        if scale_build:
            r = r * (0.8 + 0.2 * self.build) * self.lean ** 0.35
        self.s.ellip(c, r, axes, neg, stiff)

    def cap(self, p0, p1, r, neg=False, stiff=2.0):
        self.s.capsule(p0, p1, r * self.k, neg, stiff)

    def groove(self, pts, w, d):
        self.grooves.append((np.asarray(pts, float), w * self.k, d * self.k))

    def bump(self, c, r, h):
        self.bumps.append((np.asarray(c, float), r * self.k, h * self.k))

    # ---------------------------------------------------------------- corpo
    def _build(self):
        P, m, e, cap = self.P, self.m, self.e, self.cap
        lean = self.lean
        # corpos magros (lean < 1) e pouco musculosos (build < 1): tronco masculino mais reto — cintura menos
        # marcada, quadril estreito, peitoral achatado e vincos mais rasos (com lean=1 e build>=1 nada muda)
        slim = float(np.clip((1.0 - lean) / 0.1, 0.0, 1.5))
        soft = float(np.clip((self.build - 0.7) / 0.3, 0.0, 1.0))
        self.slim, self.soft = slim, soft
        # ---------------- tronco
        e(P(0, 0.004, 1.355), (0.138 * lean ** 0.3, 0.114, 0.165))         # caixa torácica
        e(P(0, -0.04, 1.17), (0.1 * (1 + 0.18 * slim), 0.068, 0.12 * (1 + 0.1 * slim)))   # abdômen
        e(P(0, 0.012, 0.995), (0.136 * (1 - 0.12 * slim), 0.092, 0.088))    # pelve
        e(P(0, -0.005, 0.895), (0.06, 0.05, 0.05), scale_build=False)        # virilha
        e(P(0, 0.07, 1.455), (0.125, 0.056, 0.075))                         # trapézio médio
        e(P(0, 0.085, 1.34), (0.06, 0.03, 0.09))                             # trapézio inferior
        for sx in (1, -1):
            X = np.array((sx, 1.0, 1.0))
            # peitoral (porção esternal, clavicular e massa) — achatado em quem é magro
            pk = 0.6 + 0.4 * soft
            m(P(0.025 * sx, -0.102, 1.34), P(0.165 * sx, -0.058, 1.425), 0.05, 0.02 * pk, F, 1.0)
            m(P(0.04 * sx, -0.094, 1.445), P(0.16 * sx, -0.05, 1.465), 0.032, 0.018 * pk, F)
            ax_ = geo.unit((sx * 1.0, 0.0, 0.3))
            ay_ = np.array((0.0, 1.0, 0.0))
            e(P(0.078 * sx, -0.093 + 0.006 * (1 - soft), 1.395), (0.064, 0.02 * pk, 0.044), (ax_, ay_, np.cross(ax_, ay_)))
            # reto abdominal (gomos) e oblíquos
            e(P(0.034 * sx, -0.08, 1.165), (0.038, 0.008, 0.135))
            ok = 1 - 0.4 * slim
            e(P(0.104 * sx * (1 - 0.06 * slim), -0.03, 1.14), (0.038 * ok, 0.052 * ok, 0.07))
            e(P(0.116 * sx * (1 - 0.1 * slim), 0.0, 1.08), (0.032 * ok, 0.045 * ok, 0.045 * ok))
            # dorsal largo, eretores, escápulas, glúteos
            m(P(0.12 * sx, 0.06, 1.42), P(0.065 * sx, 0.075, 1.15), 0.045, 0.026, B)
            e(P(0.034 * sx, 0.088, 1.2), (0.028, 0.024, 0.15))
            e(P(0.1 * sx, 0.098, 1.405), (0.058, 0.026, 0.06))
            e(P(0.078 * sx, 0.066, 0.935), np.array((0.066, 0.05, 0.076)) * (1 - 0.12 * slim))
            e(P(0.13 * sx * (1 - 0.1 * slim), 0.03, 0.995), np.array((0.05, 0.05, 0.05)) * (1 - 0.3 * slim))
            # trapézio superior e esternocleidomastoideo
            m(P(0.03 * sx, 0.035, 1.585), P(0.165 * sx, 0.02, 1.515), 0.04, 0.026, B)
            m(P(0.045 * sx, 0.02, 1.66), P(0.016 * sx, -0.066, 1.515), 0.016, 0.014, F)
        # vincos do tronco: linha alba, intersecções do abdômen, borda do peitoral, cinto de Adônis
        self.groove([P(0, -0.112, 1.3), P(0, -0.11, 1.2), P(0, -0.104, 1.08), P(0, -0.098, 1.02)], 0.011, 0.003)
        for z in (1.224, 1.157, 1.09):
            self.groove([P(-0.06, -0.1, z + 0.004), P(0, -0.108, z), P(0.06, -0.1, z + 0.004)], 0.009, 0.0022)
        for sx in (1, -1):
            # borda inferior do peitoral: rasa e mais reta em quem é magro (senão parece um busto)
            lift = 0.012 * (1 - soft)
            self.groove([P(0.02 * sx, -0.118, 1.325 + lift), P(0.09 * sx, -0.122, 1.318 + lift), P(0.15 * sx, -0.09, 1.345 + lift * 0.5),
                         P(0.175 * sx, -0.05, 1.4)], 0.01, 0.005 * (0.3 + 0.7 * soft))
            self.groove([P(0.13 * sx, -0.06, 1.1), P(0.085 * sx, -0.088, 1.0), P(0.035 * sx, -0.09, 0.93)], 0.012, 0.005 * (0.3 + 0.7 * soft))
            self.groove([P(0.17 * sx, -0.06, 1.48), P(0.15 * sx, -0.07, 1.43), P(0.145 * sx, -0.06, 1.39)], 0.008, 0.004)
        self.groove([P(0, 0.115, 1.48), P(0, 0.112, 1.3), P(0, 0.1, 1.1), P(0, 0.085, 1.0)], 0.012, 0.005)
        for sx in (1, -1):
            # bordas laterais do reto abdominal e serrátil
            self.groove([P(0.06 * sx, -0.098, 1.29), P(0.068 * sx, -0.1, 1.2), P(0.064 * sx, -0.098, 1.1), P(0.05 * sx, -0.094, 1.03)], 0.01, 0.0024)
            for i, z in enumerate((1.34, 1.3, 1.26)):
                self.groove([P(0.1 * sx, -0.088 + i * 0.004, z + 0.012), P(0.128 * sx, -0.06 + i * 0.004, z - 0.008)], 0.005, 0.0025)

        # ---------------- pescoço e cabeça
        cap(P(0, 0.015, 1.5), P(0, -0.005, 1.645), 0.055)
        self._head()

        # ---------------- braços (pose em A)
        for sx, side in ((1, 'r'), (-1, 'l')):
            self._arm(sx, side)
        # ---------------- pernas
        for sx, side, has in ((1, 'r', self.legs[0]), (-1, 'l', self.legs[1])):
            hp = P(0.088 * sx, -0.005, 0.95)
            self.lm['quadril_' + side] = hp
            if has:
                self._leg(sx, side)
            else:
                # coto arredondado sob o quadril (coberto pela roupa no Saci)
                e(P(0.09 * sx, 0.0, 0.88), (0.07, 0.07, 0.06))

    # ---------------------------------------------------------------- cabeça
    def _head(self):
        """Cabeça com proporções reais: olhos na metade da altura, nariz e boca nos terços do rosto."""
        P, cap = self.P, self.cap
        s = self.s
        k = self.k
        g = self.gaunt = getattr(self, 'gaunt', 0.0)

        def E(c, r, neg=False, st=2.0, axes=None):
            s.ellip(c, np.asarray(r) * k, axes, neg, st)
        E(P(0, 0.016, 1.79), (0.077, 0.1, 0.086))                    # crânio (testa incluída)
        E(P(0, 0.03, 1.735), (0.066, 0.08, 0.06))                    # base do crânio / nuca
        E(P(0, -0.05, 1.725), (0.054, 0.04, 0.05))                   # massa do rosto
        E(P(0, -0.042, 1.676), (0.053, 0.055, 0.04))                 # mandíbula
        E(P(0, -0.08, 1.648), (0.02, 0.017, 0.018))                  # queixo
        feat = geo.Cage()                                            # traços com tamanho exato

        def fe(c, r, axes=None):
            R = None if axes is None else np.stack([geo.unit(v) for v in axes], 1)
            feat.merge(geo.ellipsoid(c, np.asarray(r) * k, (2.0, 2.0), R, 24, 12))
        X = np.array((1.0, 0, 0))
        for sx in (1, -1):
            side = 'r' if sx > 0 else 'l'
            cap(P(0.058 * sx, -0.006, 1.67), P(0.018 * sx, -0.077, 1.645), 0.0095)   # linha da mandíbula
            fe(P(0.052 * sx, -0.068, 1.731), (0.014, 0.009, 0.009))                  # maçãs do rosto
            bx = geo.unit((1.0, 0.15 * sx, 0.22 * sx))
            by = geo.unit(np.array((0, 1.0, 0)) - bx * bx[1])
            fe(P(0.034 * sx, -0.087, 1.769), (0.022, 0.007, 0.0065), (bx, by, np.cross(bx, by)))   # arco superciliar (olhar severo)
            fe(P(0.014 * sx, -0.103, 1.707), (0.009, 0.0085, 0.008))                 # asa do nariz
            lid_up = [P(0.017 * sx, -0.092, 1.751), P(0.031 * sx, -0.0975, 1.7565), P(0.046 * sx, -0.088, 1.7525)]
            lid_lo = [P(0.018 * sx, -0.092, 1.746), P(0.031 * sx, -0.096, 1.7415), P(0.045 * sx, -0.088, 1.745)]
            feat.merge(geo.sweep(lid_up, geo.circle(8, 0.0034 * k), 14, ref=(0, -1, 0), scale=lambda t: 0.6 + 0.4 * np.sin(t * np.pi)))
            feat.merge(geo.sweep(lid_lo, geo.circle(8, 0.0026 * k), 14, ref=(0, -1, 0), scale=lambda t: 0.6 + 0.4 * np.sin(t * np.pi)))
            self.bump(P(0.031 * sx, -0.092, 1.749), 0.0105, -0.0065)               # órbita
            self.bump(P(0.0085 * sx, -0.112, 1.703), 0.0042, -0.004)               # narina
            self.bump(P(0.024 * sx, -0.101, 1.678), 0.004, -0.0025)                # canto da boca
            self.bump(P(0.048 * sx, -0.07, 1.695), 0.014, -0.003 * (0.5 + self.gaunt))   # face encovada
            self.lm['olho_' + side] = P(0.031 * sx, -0.091, 1.749)
            self.groove([P(0.016 * sx, -0.104, 1.712), P(0.028 * sx, -0.099, 1.69), P(0.031 * sx, -0.092, 1.674)], 0.0032, 0.0016)
            self.groove([P(0.02 * sx, -0.093, 1.738), P(0.04 * sx, -0.088, 1.736)], 0.003, 0.0012)
        feat.merge(geo.sweep([P(0, -0.093, 1.763), P(0, -0.103, 1.742), P(0, -0.111, 1.72)], geo.circle(12, 0.0084 * k), 14, ref=(1, 0, 0)))
        fe(P(0, -0.113, 1.712), (0.0122, 0.012, 0.011))              # ponta do nariz
        fe(P(0, -0.0995, 1.685), (0.024, 0.009, 0.0068))             # lábio superior
        fe(P(0, -0.0965, 1.671), (0.02, 0.0095, 0.0078))             # lábio inferior
        self.groove([P(-0.021, -0.106, 1.6785), P(0, -0.107, 1.678), P(0.021, -0.106, 1.6785)], 0.0022, 0.0028)
        self.parts.append(feat)
        self.lm['cabeca'] = P(0, -0.01, 1.665)
        self.lm['topo'] = P(0, 0.01, 1.866)
        # orelhas: contorno suave + aro da hélice + lóbulo; pontudas no Curupira
        for sx in (1, -1):
            c = P(0.078 * sx, 0.012, 1.74)
            tip = self.ears_pointed
            ctrl = np.array([(-0.004, -0.032), (0.012, -0.034), (0.022, -0.02), (0.026, 0.0), (0.024 + 0.022 * tip, 0.024 + 0.036 * tip),
                             (0.01, 0.032), (-0.002, 0.026), (-0.008, 0.008), (-0.008, -0.016)]) * k
            outline = geo.catmull(np.c_[ctrl, np.zeros(len(ctrl))], 5, closed=True)[:, :2]
            Y = geo.unit((0.0, 1.0, 0.0))
            Z = geo.unit((0.2 * sx, 0.0, 1.0))
            base = c + np.array((0.003 * sx, 0, 0)) * k
            ear = geo.extrude(outline * 0.92, 0.008 * k, base, Y, Z)
            rim3 = base + np.array((0.0045 * sx, 0, 0)) * k + outline[:, :1] * Y + outline[:, 1:2] * Z
            ear.merge(geo.sweep(np.vstack([rim3[6:], rim3[:4]]), geo.circle(8, 0.0042 * k), 44, ref=(sx, 0, 0), smooth=False, caps=(True, True)))
            ear.merge(geo.ellipsoid(base + Z * -0.026 * k + np.array((0.004 * sx, 0, 0)) * k, np.array((0.006, 0.009, 0.009)) * k, nu=12, nv=8))
            self.parts.append(ear)

    # ---------------------------------------------------------------- braço e mão
    def _arm(self, sx, side):
        P, m, e, cap = self.P, self.m, self.e, self.cap
        a = radians(self.arm_angle)
        S = P(0.185 * sx, 0.0, 1.475)
        dA = geo.unit((sin(a) * sx, -0.06, -cos(a)))
        L1, L2 = 0.295 * self.k, 0.255 * self.k
        E = S + dA * L1
        dF = geo.unit(dA + np.array((0.0, -0.12, 0.0)))
        W = E + dF * L2
        self.lm['ombro_' + side] = S
        self.lm['cotovelo_' + side] = E
        self.lm['pulso_' + side] = W
        out = geo.unit(np.cross(dA, (0, 1.0, 0)) * sx * -1)   # para fora do corpo
        if np.dot(out, (sx, 0, 0)) < 0:
            out = -out
        fr = geo.unit(np.cross(out, dA)) if sx > 0 else geo.unit(np.cross(dA, out))
        if np.dot(fr, F) < 0:
            fr = -fr
        # deltoide (três cabeças)
        for off, w in ((fr * 0.034, 0.03), (out * 0.03, 0.036), (-fr * 0.036, 0.03)):
            m(S + off * self.k + dA * 0.005, S + off * self.k + dA * 0.13 * self.k, w, 0.03, out)
        e(S + out * 0.012 * self.k, (0.055, 0.055, 0.055))
        cap(S, E, 0.033)
        m(S + dA * 0.08 * self.k + fr * 0.022 * self.k, E - dA * 0.045 * self.k + fr * 0.026 * self.k, 0.033, 0.034, fr, 1.05)   # bíceps
        m(S + dA * 0.05 * self.k - fr * 0.03 * self.k, E - dA * 0.05 * self.k - fr * 0.022 * self.k, 0.036, 0.034, -fr)          # tríceps
        m(S + dA * 0.1 * self.k - fr * 0.012 * self.k + out * 0.026 * self.k, E - dA * 0.07 * self.k + out * 0.02 * self.k, 0.022, 0.026, out)
        e(E - fr * 0.02 * self.k, (0.024, 0.024, 0.024), scale_build=False)                                                         # olécrano
        # antebraço: braquiorradial, flexores, extensores
        m(E - dA * 0.04 * self.k + out * 0.024 * self.k, E + dF * 0.15 * self.k + out * 0.014 * self.k, 0.025, 0.028, out, 1.05)
        m(E - out * 0.018 * self.k, E + dF * 0.17 * self.k - out * 0.012 * self.k, 0.03, 0.028, -out)
        m(E - fr * 0.012 * self.k, E + dF * 0.16 * self.k - fr * 0.012 * self.k, 0.026, 0.026, -fr)
        cap(E, W, 0.024)
        e(W, (0.027, 0.018, 0.022), scale_build=False)
        self.groove([S + fr * 0.05 * self.k, S + dA * 0.12 * self.k + fr * 0.045 * self.k], 0.008, 0.003)
        self._hand(W, dF, out, fr, sx, side)

    def _hand(self, W, d, out, fr, sx, side):
        """Mão relaxada: palma (metaball) + dedos em tubos curvados para a palma, levemente abertos,
        com nós dos dedos e pontas arredondadas; polegar oposto à frente."""
        k = self.k
        palm = -out                                             # a palma olha para o corpo
        self.s.ellip(W + d * 0.05 * k, np.array((0.019, 0.046, 0.052)) * k, (out, fr, d))
        self.s.ellip(W + (d * 0.03 + fr * 0.024 + palm * 0.008) * k, np.array((0.016, 0.017, 0.028)) * k, (out, fr, d))   # tenar
        self.s.ellip(W + (d * 0.04 - fr * 0.026 + palm * 0.006) * k, np.array((0.014, 0.012, 0.03)) * k, (out, fr, d))    # hipotenar
        cage = geo.Cage()
        specs = ((0.034, 9.0, (0.046, 0.028, 0.021), 0.0089), (0.0115, 2.0, (0.05, 0.031, 0.023), 0.0093),
                 (-0.0115, -5.0, (0.047, 0.03, 0.022), 0.0089), (-0.033, -13.0, (0.038, 0.024, 0.019), 0.008))
        for i, (off, spread, lens, rr) in enumerate(specs):
            p = W + (d * 0.098 + fr * off) * k
            dd = geo.rot(out, radians(spread) * sx) @ d
            pts = [p - dd * 0.014 * k]
            for j, L in enumerate(lens):
                ax = geo.unit(np.cross(dd, palm))
                dd = geo.rot(ax, radians((22, 34, 24)[j] + i * 3)) @ dd
                p = p + dd * L * k
                pts.append(p.copy())
            r_ = rr * k
            cage.merge(geo.sweep(pts, geo.circle(12, r_), 18, ref=out,
                                 scale=lambda t: (1.0 - 0.2 * t) * (1.0 + 0.07 * np.cos(t * 3 * np.pi) ** 6), caps=(True, False)))
            for q in pts[1:-1]:
                cage.merge(geo.ellipsoid(q, (r_ * 1.08,) * 3, nu=12, nv=6))
            cage.merge(geo.ellipsoid(pts[-1], (r_ * 0.8,) * 3, nu=12, nv=6))
        t0 = W + (d * 0.045 + fr * 0.03 + palm * 0.012) * k
        td = geo.unit(d * 0.6 + fr * 0.45 + palm * 0.6)
        tp = [t0, t0 + td * 0.026 * k]
        td2 = geo.unit(td + d * 0.3 + palm * 0.25 - fr * 0.2)
        tp.append(tp[-1] + td2 * 0.022 * k)
        tp.append(tp[-1] + geo.unit(td2 + d * 0.2 + palm * 0.2 - fr * 0.25) * 0.017 * k)
        cage.merge(geo.sweep(tp, geo.circle(12, 0.0112 * k), 16, ref=out, scale=lambda t: 1.0 - 0.25 * t, caps=(True, False)))
        cage.merge(geo.ellipsoid(tp[-1], (0.0084 * k,) * 3, nu=12, nv=6))
        self.extras.append(cage)
        self.lm['mao_' + side] = W + d * 0.075 * k
        self.lm['palma_' + side] = W + (d * 0.07 + palm * 0.03) * k
        self.lm['dedos_' + side] = W + d * 0.16 * k

    # ---------------------------------------------------------------- perna e pé
    def _leg(self, sx, side):
        P, m, e, cap = self.P, self.m, self.e, self.cap
        k = self.k
        H = P(0.088 * sx, -0.005, 0.95)
        K = P(0.098 * sx, -0.012, 0.52)
        A = P(0.104 * sx, 0.025, 0.088)
        self.lm['joelho_' + side] = K
        self.lm['tornozelo_' + side] = A
        out = np.array((sx, 0.0, 0.0))
        cap(H, K, 0.046)
        lerp = lambda t: H + (K - H) * t
        m(H + (F * 0.04 + UP * 0.03) * k, K + (F * 0.035 + UP * 0.08) * k, 0.04, 0.036, F)                    # reto femoral
        m(H + (out * 0.05 - UP * 0.04) * k, K + (out * 0.034 + UP * 0.08 + F * 0.01) * k, 0.046, 0.046, out, 1.05)   # vasto lateral
        e(K + (-out * 0.034 + F * 0.022 + UP * 0.09) * k, (0.034, 0.034, 0.058))                                # vasto medial
        m(P(0.03 * sx, -0.012, 0.905), K + (-out * 0.03 + UP * 0.16) * k, 0.04, 0.045, -out)                    # adutores
        m(P(0.062 * sx, 0.06, 0.905), K + (B * 0.03 + UP * 0.06) * k, 0.046, 0.045, B)                          # posteriores
        e(K + F * 0.044 * k, (0.024, 0.012, 0.03), scale_build=False)                                            # patela
        e(K, (0.032, 0.033, 0.034), scale_build=False)
        # panturrilha (gastrocnêmio duplo + sóleo), tibial, tendão de Aquiles
        e(K + (B * 0.046 - out * 0.019 - UP * 0.135) * k, (0.039, 0.045, 0.094))
        e(K + (B * 0.04 + out * 0.021 - UP * 0.125) * k, (0.035, 0.039, 0.085))
        e(K + (B * 0.028 - UP * 0.25) * k, (0.038, 0.032, 0.085))
        m(K + (F * 0.024 + out * 0.014 - UP * 0.05) * k, A + (F * 0.012 + out * 0.004 + UP * 0.12) * k, 0.02, 0.022, F)
        cap(K, A - UP * 0.02 * k, 0.033)
        cap(A + (B * 0.022 + UP * 0.16) * k, A + (B * 0.034 - UP * 0.02) * k, 0.012)
        for o in (-1, 1):
            e(A + out * o * 0.024 * k, (0.012, 0.014, 0.014), scale_build=False)
        self.groove([lerp(0.05) + F * 0.06 * k + out * 0.03 * k, lerp(0.5) + F * 0.06 * k, K + (F * 0.03 - out * 0.05 + UP * 0.05) * k], 0.009, 0.0035)
        self._foot(A, sx, side)

    def _foot(self, A, sx, side):
        k = self.k
        fwd = -F if self.back_feet else F      # para onde apontam os dedos
        X = np.array((1.0, 0, 0))
        self.s.ellip(A + (fwd * 0.012 - UP * 0.028) * k, np.array((0.034, 0.048, 0.04)) * k, (X, fwd, UP))   # tornozelo/peito do pé
        self.s.ellip(A + (-fwd * 0.04 - UP * 0.058) * k, np.array((0.031, 0.036, 0.031)) * k)                # calcanhar
        self.s.ellip(A + (fwd * 0.065 - UP * 0.064) * k, np.array((0.04, 0.085, 0.026)) * k, (X, fwd, UP))    # arco
        ball = A + (fwd * 0.14 - UP * 0.074) * k
        self.s.ellip(ball, np.array((0.047, 0.032, 0.02)) * k)
        cage = geo.Cage()
        for i, (dx, L, rr) in enumerate(((-0.031, 0.046, 0.0125), (-0.012, 0.04, 0.0098), (0.005, 0.036, 0.0092), (0.02, 0.031, 0.0086), (0.033, 0.026, 0.008))):
            x = dx * (1 if sx > 0 else -1) * (-1 if self.back_feet else 1)
            p0 = ball + (np.array((x, 0, 0)) + fwd * 0.012) * k
            p1 = p0 + (fwd * L - UP * 0.008) * k
            cage.merge(geo.sweep([p0, (p0 + p1) / 2 + UP * 0.004 * k, p1], geo.circle(10, rr * k), 10, ref=UP,
                                 scale=lambda s: 1.0 - 0.12 * s, caps=(True, True)))
        self.parts.append(cage)
        self.lm['pe_' + side] = A + (fwd * 0.04 - UP * 0.07) * k
