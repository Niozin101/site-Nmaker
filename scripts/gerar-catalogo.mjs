/* Gera servidor/catalogo.json a partir do PRODUTOS do site/index.html.
   Roda sozinho a cada publicação (npm run build), então o servidor sempre cobra
   os mesmos preços que aparecem no site, e o cliente não consegue alterar o valor. */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const ini = html.indexOf('const PRODUTOS = [');
const fim = html.indexOf('\n];', ini);
if (ini < 0 || fim < 0) throw new Error('Não encontrei "const PRODUTOS = [" no index.html');

// O array só tem textos e números; roda isolado, sem acesso a nada do computador
const contexto = {};
vm.runInNewContext(html.slice(ini, fim + 3).replace('const PRODUTOS', 'PRODUTOS'), contexto, { timeout: 1000 });

// Fanarts (site/js/fanart.js): "window.PRODUTOS_FANART = [...];"
const fanart = readFileSync(new URL('../site/js/fanart.js', import.meta.url), 'utf8');
const ctxFanart = { window: {} };
vm.runInNewContext(fanart, ctxFanart, { timeout: 1000 });
contexto.PRODUTOS.push(...(ctxFanart.window.PRODUTOS_FANART || []));

const catalogo = {};
for (const p of contexto.PRODUTOS) {
  catalogo[p.id] = {
    nome: p.nome,
    preco: Number(p.preco) || 0,
    personalizavel: !!p.personalizavel,
    variantes: (p.variantes || []).map(v => ({ nome: v.nome, preco: Number(v.preco) || 0 })),
  };
}
writeFileSync(new URL('../servidor/catalogo.json', import.meta.url), JSON.stringify(catalogo, null, 1));
console.log(`catalogo.json gerado com ${Object.keys(catalogo).length} produtos`);
