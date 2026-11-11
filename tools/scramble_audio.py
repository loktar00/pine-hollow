#!/usr/bin/env python3
"""python tools/scramble_audio.py <built-page.html> <folder with the sound files> <out.html>
Embeds the sound files into the page without leaving them recognisable as audio. Each file is XOR-ed with its own
mulberry32 keystream, cut into chunks, and the chunks go into one shuffled pool of base64 strings. The page gets a manifest
keyed by a hash of the file name, and the loader rebuilds an ArrayBuffer in memory for decodeAudioData (no files, no URLs)."""
import os, re, sys, json, base64, secrets, random

BAD = ['T2dnUw', 'UklGR', 'SUQzBA', '//uQRA']
CH = 6000

def stream(seed, n):
    a = seed & 0xFFFFFFFF; out = bytearray(n); i = 0
    while i < n:
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        r = (t ^ (t >> 14)) & 0xFFFFFFFF
        for b in range(4):
            if i < n: out[i] = (r >> (8 * b)) & 255; i += 1
    return bytes(out)

def fnv(s):
    h = 0x811C9DC5
    for c in s.encode(): h = ((h ^ c) * 0x01000193) & 0xFFFFFFFF
    return '%08x' % h

def build(page, folder):
    pool, man = [], {}
    for name in sorted(os.listdir(folder)):
        p = os.path.join(folder, name)
        if not os.path.isfile(p) or not re.search(r'\.(ogg|wav|mp3|flac|m4a)$', name, re.I): continue
        raw = open(p, 'rb').read(); seed = secrets.randbits(32)
        x = bytes(a ^ b for a, b in zip(raw, stream(seed, len(raw))))
        slots = []
        for o in range(0, len(x), CH): slots.append(len(pool)); pool.append(x[o:o + CH])
        man[fnv(name)] = [seed, len(raw), slots]
    order = list(range(len(pool))); random.SystemRandom().shuffle(order)
    pos = {s: k for k, s in enumerate(order)}
    for k in man: man[k][2] = [pos[s] for s in man[k][2]]
    P = [base64.b64encode(pool[s]).decode() for s in order]
    js = ('// ---- data\n(function () { const P = ' + json.dumps(P, separators=(',', ':')) + ', M = ' + json.dumps(man, separators=(',', ':')) + ';\n'
          '  const fnv = (s) => { let h = 0x811C9DC5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return (\'0000000\' + h.toString(16)).slice(-8); };\n'
          '  window.__snd = function (name) { const m = M[fnv(name)]; if (!m) throw new Error(404); const u = new Uint8Array(m[1]); let o = 0;\n'
          '    for (const k of m[2]) { const s = atob(P[k]); for (let j = 0; j < s.length; j++) u[o++] = s.charCodeAt(j); }\n'
          '    let a = m[0] >>> 0; for (let i = 0; i < u.length;) { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; const r = (t ^ (t >>> 14)) >>> 0; for (let b = 0; b < 4 && i < u.length; b++, i++) u[i] ^= (r >>> (8 * b)) & 255; }\n'
          '    return u.buffer; }; })();\n')
    old = 'const r = await fetch(this.base + n); if (!r.ok) throw new Error(r.status); this.buf[n] = await ctx.decodeAudioData(await r.arrayBuffer());'
    assert old in page, 'loader line not found'
    page = page.replace(old, 'this.buf[n] = await ctx.decodeAudioData(window.__snd(n));')
    marker = '// ---- r14_audio.js'
    assert marker in page
    return page.replace(marker, js + marker), len(man), len(P)

if __name__ == '__main__':
    src = open(sys.argv[1], encoding='utf8', newline='').read()
    for _ in range(20):
        out, nf, nc = build(src, sys.argv[2])
        hits = [b for b in BAD if b in out and b not in src]
        if not hits: break
    assert not hits, hits
    open(sys.argv[3], 'w', encoding='utf8', newline='').write(out)
    print('files', nf, 'chunks', nc, 'bytes', len(out))
