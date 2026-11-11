#!/usr/bin/env python3
"""build.py -- concatenate src/*.js (sim modules a*, render modules r*) and inline three.js into dist/index.html.
Audio files are not embedded: they sit next to the page in dist/audio/ (see tools/fetch_audio.sh)."""
import io, os, glob
here = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: io.open(os.path.join(here, p), encoding='utf-8').read()
shell = rd('src/shell.html')
three = rd('src/three.min.js')
k = three.index('/**')            # drop the deprecation console.warn that precedes the licence banner
three = '0,' + three[k:]
files = sorted(glob.glob(os.path.join(here, 'src', '[ar][0-9][0-9]_*.js')), key=os.path.basename)
game = '\n'.join('// ---- %s\n%s' % (os.path.basename(p), io.open(p, encoding='utf-8').read()) for p in files)
html = shell.replace('/*__THREE__*/', three.replace('</script', '<\\/script')).replace('/*__GAME__*/', game)
os.makedirs(os.path.join(here, 'dist', 'audio'), exist_ok=True)
io.open(os.path.join(here, 'dist', 'index.html'), 'w', encoding='utf-8', newline='\n').write(html)
print('dist/index.html', len(html), 'bytes from', len(files), 'modules')
