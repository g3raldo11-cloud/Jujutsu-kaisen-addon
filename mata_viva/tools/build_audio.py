"""Synthesize the game's sound effects and music loops as 16-bit mono WAV files."""
import os
import sys
import wave
import numpy as np

SR = 22050
rng = np.random.default_rng(1756)


def t_(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, a=0.005, d=None, curve=3.0):
    """Attack then exponential-ish decay over n samples."""
    x = np.ones(n)
    na = max(1, int(SR * a))
    x[:na] = np.linspace(0, 1, na)
    rest = n - na
    if rest > 0:
        x[na:] = (1 - np.linspace(0, 1, rest)) ** curve
    return x


def noise(n):
    return rng.uniform(-1, 1, n)


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array (sweep)."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    s = 0.0
    for i in range(len(x)):
        s += a[i] * (x[i] - s)
        y[i] = s
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def sweep_sine(f0, f1, dur, shape='sine'):
    n = int(SR * dur)
    f = np.geomspace(max(f0, 1), max(f1, 1), n)
    ph = 2 * np.pi * np.cumsum(f) / SR
    if shape == 'square':
        return np.sign(np.sin(ph))
    if shape == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if shape == 'tri':
        return 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1) - 1) - 1
    return np.sin(ph)


def tone(freq, dur, shape='sine', vib=0.0, vibf=5.0):
    tt = t_(dur)
    f = freq * (1 + vib * np.sin(2 * np.pi * vibf * tt))
    ph = 2 * np.pi * np.cumsum(f) / SR
    if shape == 'tri':
        return 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1) - 1) - 1
    if shape == 'square':
        return np.sign(np.sin(ph)) * 0.6
    if shape == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    return np.sin(ph)


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def place(buf, x, at):
    i = int(at * SR)
    j = min(len(buf), i + len(x))
    if j > i:
        buf[i:j] += x[:j - i]


def norm(x, peak=0.85):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def crush(x, bits=6):
    q = 2 ** (bits - 1)
    return np.round(x * q) / q


def save(path, x, peak=0.85):
    x = norm(x, peak)
    data = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)


# ---------------------------------------------------------------- effects
def sfx_shoot():
    n = int(SR * 0.16)
    twang = sweep_sine(900, 320, 0.16, 'tri') * env(n, 0.002, curve=4)
    whip = highpass(noise(n), 2500) * env(n, 0.001, curve=6) * 0.6
    return mix(twang * 0.7, whip)


def sfx_hit():
    n = int(SR * 0.12)
    thud = sweep_sine(260, 110, 0.12) * env(n, 0.001, curve=3)
    click = highpass(noise(n), 1800) * env(n, 0.0005, curve=12)
    return crush(mix(thud, click * 0.7), 7)


def sfx_hit_heavy():
    n = int(SR * 0.28)
    thud = sweep_sine(180, 50, 0.28) * env(n, 0.001, curve=2.5)
    crack = lowpass(noise(n), 3000) * env(n, 0.0005, curve=8)
    return crush(mix(thud, crack * 0.8), 6)


def sfx_hurt():
    n = int(SR * 0.24)
    sq = sweep_sine(420, 110, 0.24, 'square') * env(n, 0.002, curve=2)
    nz = lowpass(noise(n), 1500) * env(n, 0.001, curve=5)
    return crush(mix(sq * 0.5, nz * 0.6), 5)


def sfx_dash():
    n = int(SR * 0.26)
    cut = 300 + 3500 * np.sin(np.linspace(0, np.pi, n)) ** 2
    w = lowpass(noise(n), cut) * np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return w


def sfx_roots():
    n = int(SR * 0.6)
    rumble = lowpass(noise(n), 160) * env(n, 0.02, curve=1.5) * 1.6
    out = rumble
    for k in range(7):
        m = int(SR * 0.05)
        c = highpass(noise(m), 1200) * env(m, 0.0005, curve=10)
        out = mix(out, np.concatenate([np.zeros(int(SR * (0.03 + k * 0.06))), c * 0.8]))
    return out


def sfx_heal():
    buf = np.zeros(int(SR * 0.9))
    for k, f in enumerate([523.25, 659.25, 783.99, 1046.5, 1318.5]):
        n = int(SR * 0.5)
        x = tone(f, 0.5, 'tri') * env(n, 0.005, curve=2.5) * 0.5
        place(buf, x, k * 0.07)
    return buf


def sfx_burst():
    n = int(SR * 0.8)
    cut = np.geomspace(200, 6000, n)
    whoosh = lowpass(noise(n), cut) * env(n, 0.15, curve=2)
    boom = sweep_sine(120, 35, 0.8) * env(n, 0.001, curve=2) * 1.2
    crack = highpass(noise(int(SR * 0.08)), 2000) * env(int(SR * 0.08), 0.0005, curve=8)
    return mix(whoosh * 0.7, boom, np.concatenate([np.zeros(int(SR * 0.12)), crack]))


def sfx_fireball():
    n = int(SR * 0.4)
    cut = np.geomspace(2500, 400, n)
    fw = lowpass(noise(n), cut) * env(n, 0.02, curve=1.8)
    crackle = (rng.random(n) > 0.995) * noise(n) * env(n, 0.0, curve=1)
    return mix(fw, crackle * 0.6)


def sfx_explode():
    n = int(SR * 0.9)
    body = lowpass(noise(n), np.geomspace(1800, 120, n)) * env(n, 0.002, curve=2.2) * 1.4
    sub = sweep_sine(90, 32, 0.9) * env(n, 0.001, curve=2)
    crackle = (rng.random(n) > 0.993) * noise(n) * env(n, 0.0, curve=1.5)
    return crush(mix(body, sub, crackle * 0.5), 7)


def sfx_ring():
    n = int(SR * 0.55)
    cut = 600 + 2400 * np.abs(np.sin(np.linspace(0, 3 * np.pi, n)))
    return lowpass(noise(n), cut) * env(n, 0.03, curve=1.5)


def sfx_roar():
    dur = 1.4
    n = int(SR * dur)
    tt = t_(dur)
    f = 78 + 10 * np.sin(2 * np.pi * 6 * tt) + np.linspace(0, -25, n)
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = (2 * ((ph / (2 * np.pi)) % 1) - 1)
    growl = lowpass(noise(n), 500) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * tt))
    shape = np.minimum(1, tt / 0.15) * (1 - tt / dur) ** 0.8
    return crush(mix(saw * 0.7, growl) * shape, 6)


def sfx_charge():
    n = int(SR * 0.45)
    rise = sweep_sine(180, 700, 0.45, 'saw') * np.linspace(0.2, 1, n) * 0.4
    w = lowpass(noise(n), np.geomspace(300, 3000, n)) * np.linspace(0.1, 1, n)
    return crush(mix(rise, w), 6)


def sfx_warn():
    n = int(SR * 0.12)
    return tone(1320, 0.12, 'square') * env(n, 0.002, curve=1.5) * 0.5


def sfx_ui():
    a = tone(880, 0.05, 'square') * env(int(SR * 0.05), 0.001, curve=1)
    b = tone(1320, 0.07, 'square') * env(int(SR * 0.07), 0.001, curve=2)
    return np.concatenate([a, b]) * 0.5


def sfx_burn():
    n = int(SR * 0.09)
    return highpass(noise(n), 3000) * env(n, 0.001, curve=4) * 0.5


def sfx_boss_intro():
    dur = 2.0
    n = int(SR * dur)
    hit = sweep_sine(110, 40, dur) * env(n, 0.001, curve=2.5)
    ring = mix(tone(220, dur) * 0.3, tone(331, dur) * 0.2, tone(497, dur) * 0.12) * env(n, 0.001, curve=3)
    sw = lowpass(noise(n), 900) * env(n, 0.001, curve=6) * 0.8
    return mix(hit * 1.2, ring, sw)


def jingle(notes, step, shape='tri', tail=0.6):
    buf = np.zeros(int(SR * (len(notes) * step + tail)))
    for i, f in enumerate(notes):
        if f <= 0:
            continue
        dur = step + tail if i == len(notes) - 1 else step * 1.6
        n = int(SR * dur)
        x = tone(f, dur, shape, vib=0.004, vibf=6) * env(n, 0.005, curve=2)
        place(buf, x * 0.5, i * step)
    return buf


def sfx_win():
    a = jingle([392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 1046.5], 0.11, 'tri', 1.0)
    drum = sfx_hit_heavy()
    out = np.zeros(len(a))
    place(out, drum * 0.6, 0.0)
    place(out, drum * 0.6, 0.66)
    return mix(a, out)


def sfx_lose():
    return jingle([392.0, 349.23, 311.13, 261.63, 196.0], 0.22, 'saw', 1.2) * 0.6


# ---------------------------------------------------------------- music
def drum(freq0, freq1, dur, noise_amt=0.3, cut=900):
    n = int(SR * dur)
    body = sweep_sine(freq0, freq1, dur) * env(n, 0.001, curve=3)
    nz = lowpass(noise(n), cut) * env(n, 0.001, curve=8) * noise_amt
    return body + nz


def shaker(dur=0.06):
    n = int(SR * dur)
    return highpass(noise(n), 4000) * env(n, 0.004, curve=3) * 0.25


def flute(freq, dur):
    n = int(SR * dur)
    tt = t_(dur)
    vib = 1 + 0.008 * np.sin(2 * np.pi * 5.2 * tt) * np.minimum(1, tt / 0.25)
    ph = 2 * np.pi * np.cumsum(freq * vib) / SR
    x = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    breath = lowpass(highpass(noise(n), 1500), 5000) * 0.05
    shape = np.minimum(1, tt / 0.06) * np.minimum(1, (dur - tt) / 0.12)
    return (x * 0.5 + breath) * shape


def music(fury=False):
    bpm = 100
    beat = 60 / bpm
    bars = 8
    dur = bars * 4 * beat
    buf = np.zeros(int(SR * dur))
    kick = drum(95, 48, 0.45, 0.4, 600)
    tom_lo = drum(140, 90, 0.3, 0.3, 900)
    tom_hi = drum(210, 150, 0.22, 0.3, 1400)
    for bar in range(bars):
        b0 = bar * 4 * beat
        pattern = [(0, kick, 1.0), (1.5, tom_lo, 0.7), (2, kick, 0.8), (3, tom_hi, 0.6), (3.5, tom_lo, 0.6)]
        if fury:
            pattern += [(0.75, tom_hi, 0.5), (2.5, tom_hi, 0.55), (2.75, tom_lo, 0.5), (1, kick, 0.6)]
        for (pos, snd, g) in pattern:
            place(buf, snd * g, b0 + pos * beat)
        steps = 16 if fury else 8
        for k in range(steps):
            acc = 1.0 if k % (4 if fury else 2) == 0 else 0.55
            place(buf, shaker() * acc, b0 + k * (4 * beat / steps))
    tt = t_(dur)
    # drone on D with a fifth, breathing slowly
    d = 73.42
    drone = (np.sin(2 * np.pi * d * tt) + 0.6 * np.sin(2 * np.pi * d * 1.5 * tt) + 0.3 * np.sin(2 * np.pi * d * 2 * tt))
    drone *= 0.18 * (0.75 + 0.25 * np.sin(2 * np.pi * tt / (4 * beat)))
    if fury:
        drone = np.tanh(drone * 3) * 0.22
    buf += lowpass(drone, 700)
    # bamboo flute motif (D minor pentatonic)
    D = {'D4': 293.66, 'F4': 349.23, 'G4': 392.0, 'A4': 440.0, 'C5': 523.25, 'D5': 587.33}
    motif = [('A4', 0, 1.0), ('C5', 1, 0.5), ('A4', 1.5, 0.5), ('G4', 2, 1.5), ('F4', 4, 1.0), ('G4', 5, 0.5), ('A4', 5.5, 0.5), ('D4', 6, 2.0)]
    if fury:
        motif = [('D5', 0, 0.5), ('C5', 0.5, 0.5), ('A4', 1, 1.0), ('G4', 2, 0.5), ('A4', 2.5, 0.5), ('C5', 3, 1.0),
                 ('D5', 4, 0.5), ('C5', 4.5, 0.5), ('A4', 5, 0.5), ('G4', 5.5, 0.5), ('F4', 6, 0.5), ('G4', 6.5, 0.5), ('D4', 7, 1.0)]
    for rep in (0, 2, 4, 6) if not fury else (0, 2, 4, 6):
        if not fury and rep in (2, 6):
            continue
        for (nm, pos, ln) in motif:
            place(buf, flute(D[nm], ln * beat) * (0.32 if not fury else 0.26), rep * 4 * beat + pos * beat)
    if fury:  # fire crackle bed
        cr = (rng.random(len(buf)) > 0.9985) * noise(len(buf)) * 0.35
        buf += lowpass(cr, 3000)
    # make the loop seamless: fade the tail of reverb-free content is already aligned to bars
    return buf


def ambience():
    dur = 8.0
    n = int(SR * dur)
    tt = t_(dur)
    wind = lowpass(noise(n), 260) * (0.5 + 0.5 * np.sin(2 * np.pi * tt / dur)) * 0.5
    buf = wind.copy()
    for k in range(70):  # crickets: short high chirps in pairs
        at = rng.uniform(0, dur - 0.2)
        f = rng.uniform(4200, 5200)
        for c in range(rng.integers(2, 4)):
            m = int(SR * 0.018)
            ch = np.sin(2 * np.pi * f * np.arange(m) / SR) * env(m, 0.002, curve=1.2) * rng.uniform(0.05, 0.12)
            place(buf, ch, at + c * 0.045)
    for k in range(6):  # frogs
        at = rng.uniform(0, dur - 0.5)
        m = int(SR * 0.16)
        fr = sweep_sine(380, 260, 0.16, 'square') * env(m, 0.01, curve=1.5) * 0.06
        place(buf, lowpass(fr, 1200), at)
    # crossfade ends for a seamless loop
    xf = int(SR * 0.5)
    head = buf[:xf].copy()
    buf[-xf:] = buf[-xf:] * np.linspace(1, 0, xf) + head * np.linspace(0, 1, xf)
    return buf[:-xf] if False else buf


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    sfx = {
        'shoot': sfx_shoot, 'hit': sfx_hit, 'hit_heavy': sfx_hit_heavy, 'hurt': sfx_hurt, 'dash': sfx_dash,
        'roots': sfx_roots, 'heal': sfx_heal, 'burst': sfx_burst, 'fireball': sfx_fireball, 'explode': sfx_explode,
        'ring': sfx_ring, 'roar': sfx_roar, 'charge': sfx_charge, 'warn': sfx_warn, 'ui': sfx_ui, 'burn': sfx_burn,
        'boss_intro': sfx_boss_intro, 'win': sfx_win, 'lose': sfx_lose,
    }
    for name, fn in sfx.items():
        save(os.path.join(out_dir, f'{name}.wav'), fn())
    save(os.path.join(out_dir, 'music_mata.wav'), music(False), 0.7)
    save(os.path.join(out_dir, 'music_furia.wav'), music(True), 0.75)
    save(os.path.join(out_dir, 'ambience.wav'), ambience(), 0.5)
    for f in sorted(os.listdir(out_dir)):
        print(f, os.path.getsize(os.path.join(out_dir, f)))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'audio'))
