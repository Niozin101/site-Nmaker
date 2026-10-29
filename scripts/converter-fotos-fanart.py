# Copia/reduz as fotos de fanart listadas em scripts/_fotos-fanart.json (gerado por gerar-fanart.mjs)
# Uso: python scripts/converter-fotos-fanart.py
import json, os
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
plano = json.load(open(os.path.join(RAIZ, 'scripts', '_fotos-fanart.json'), encoding='utf-8'))
feitos = 0
for f in plano['fotos']:
    destino = os.path.join(RAIZ, 'site', f['para'])
    if os.path.exists(destino):
        continue
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    im = Image.open(os.path.join(plano['pasta'], f['de'])).convert('RGB')
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))   # quadrada, como os outros produtos
    if s > f['lado']:
        im = im.resize((f['lado'], f['lado']), Image.LANCZOS)
    im.save(destino, 'WEBP', quality=78 if f['lado'] > 600 else 80, method=6)
    feitos += 1
print(f'{feitos} fotos convertidas')
