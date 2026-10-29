/* Gera os produtos de fanart a partir das fotos baixadas do Whale 3D Studio
   (pasta com meta.json + mNNN-N.webp, criada pelo scripts/baixar-fotos-whale.js).

   Uso:  node scripts/gerar-fanart.mjs A:\whale-fotos
   Gera: site/js/fanart.js (window.PRODUTOS_FANART) e scripts/_fotos-fanart.json
         (lista de fotos para o scripts/converter-fotos-fanart.py copiar/reduzir). */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PASTA = process.argv[2] || 'A:/whale-fotos';
// Preços pela pesquisa de mercado (out/2026: Mercado Livre, Elo7, lojas de impressão 3D),
// para bonecos de 20 cm: tricô entre R$ 110 e R$ 150 (os elaborados chegam a R$ 150; volumosos até R$ 190).
// Faixas pela quantidade de cores (cada troca de cor gasta filamento e tempo) e pelo volume.
const PRECOS = {
  simples: { trico: 129.90, lisa: 109.90 },  // poucas cores
  colorido: { trico: 149.90, lisa: 129.90 }, // muitas cores e detalhes (a maioria)
  grande: { trico: 169.90, lisa: 149.90 },   // volumosos e coloridos
  abobora: { trico: 79.90, lisa: 79.90 },    // decoração de Halloween
};
// Versão "Pequeno" (metade da altura, ~10 cm): bonecos 3D desse tamanho saem entre R$ 55 e R$ 80
const PRECOS_PEQUENO = {
  simples: { trico: 59.90, lisa: 49.90 },
  colorido: { trico: 69.90, lisa: 59.90 },
  grande: { trico: 79.90, lisa: 69.90 },
  abobora: { trico: 44.90, lisa: 44.90 },
};
const GRANDES = /^(Charizard|Venusaur|Blastoise|Dragonite|Feraligatr|Typhlosion|Meganium|Mega Greninja|Krookodile|Snorlax|Bowser|Hulk|Kratos|Titã de Ataque|Donkey Kong|Demogorgon|Gengar Esqueleto|Venom)(?![\wÀ-ú])/;
// Simples = personagem quase de uma cor só (nome exato, com ou sem "Efeito Tricô")
const SIMPLES = /^(Pikachu|Kirby|Snoopy|Minion|Eevee|Psyduck|Togepi|Jigglypuff|Caterpie|Mew|Bonbon Dog|Squirtle|Charmander|Bulbasaur|Chikorita|Cyndaquil|Totodile|Cubone|Meowth|Gengar|Pochita|Baymax|Stitch|Stitch Sentado|Anjo|Anjo Sentada|Cogumelo do Mario|Estrela Luma|Toad|Yoshi|Kuromi|Sussy Bird|Derpy Tiger|Tung Tung Tung Sahur|Ursinho Pooh|Tigrão|Bluey|Bingo|Rex Amarelo|Mike Wazowski|Sulley|Smurf|Fúria da Luz|Banguela|Max \(cão do Grinch\)|Perry o Ornitorrinco Articulado|Dugtrio Desmoronando)( Efeito Tricô)?$/;
const faixa = nome => /^Abóbora/.test(nome) ? 'abobora' : GRANDES.test(nome) ? 'grande' : SIMPLES.test(nome) ? 'simples' : 'colorido';
const precoDe = (nome, estilo, pequeno = false) => (pequeno ? PRECOS_PEQUENO : PRECOS)[faixa(nome)][estilo];
const CRIADO = '2026-10-22';
const { modelos } = JSON.parse(readFileSync(path.join(PASTA, 'meta.json'), 'utf8'));

// Modelos que não entram no site (por título)
const FORA = /^$/;

// Peças que não são bonecos: nome, preço e descrição próprios (a ordem importa: o primeiro que bater vale)
const ITENS = [
  [/moon flexi lamp/i, { nome: 'Luminária Luffy na Lua', preco: 99.90, desc: 'Luminária decorativa em impressão 3D multicolor, com Luffy articulado pendurado na lua.' }],
  [/mera mera.*fidget/i, { nome: 'Fidget Toy Mera Mera no Mi', preco: 49.90, desc: 'Brinquedo antiestresse com engrenagens que giram, inspirado na Fruta do Diabo de fogo.' }],
  [/gomu gomu.*fidget/i, { nome: 'Fidget Toy Gomu Gomu no Mi', preco: 49.90, desc: 'Brinquedo antiestresse com engrenagens que giram, inspirado na Fruta do Diabo de borracha.' }],
  [/mera mera/i, { nome: 'Fruta Mera Mera no Mi', preco: 49.90, desc: 'Fruta do Diabo de fogo em impressão 3D multicolor, para decorar ou colecionar.' }],
  [/kozo kanamori mask/i, { nome: 'Máscara Kozo Kanamori', preco: 89.90, desc: 'Máscara em impressão 3D multicolor, para decorar ou usar em cosplay.' }],
  [/hotaru haganezuka mask/i, { nome: 'Máscara Hotaru Haganezuka', preco: 89.90, desc: 'Máscara em impressão 3D multicolor, para decorar ou usar em cosplay.' }],
  [/toothless face/i, { nome: 'Chaveiro Banguela', preco: 19.90, desc: 'Chaveiro com o rostinho do Banguela, em impressão 3D com textura de tricô.' }],
  [/controller holder/i, { nome: 'Suporte de Controle Banguela', preco: 59.90, desc: 'Suporte para controle de videogame em formato de Banguela, com textura de tricô.' }],
  [/pokeball gear fidget/i, { nome: 'Fidget Toy Pokébola', preco: 49.90, desc: 'Brinquedo antiestresse com engrenagens que giram, em formato de Pokébola.' }],
  [/gengar skeleton - wall decor/i, { nome: 'Quadro Gengar Esqueleto', preco: 79.90, desc: 'Decoração de parede em impressão 3D multicolor.' }],
  [/keycap switch/i, { nome: 'Keycap Fidget Bulbasaur', preco: 29.90, desc: 'Tecla com switch mecânico (Cherry MX) para apertar à vontade: chaveiro antiestresse.' }],
  [/chikorita.*keychain/i, { nome: 'Chikorita Chaveiro ou Cofrinho', preco: 19.90, desc: 'Com textura de tricô. Escolha o tamanho chaveiro ou o cofrinho.', formatos: [['Chaveiro', 19.90], ['Cofrinho', 59.90]] }],
  [/pikachu.*keychain/i, { nome: 'Pikachu Chaveiro ou Cofrinho', preco: 19.90, desc: 'Com textura de tricô. Escolha o tamanho chaveiro ou o cofrinho.', formatos: [['Chaveiro', 19.90], ['Cofrinho', 59.90]] }],
  [/charger stand/i, { nome: 'Suporte de Carregador Pokébola', preco: 59.90, desc: 'Suporte para carregador de celular em formato de Pokébola.' }],
  [/airless pokeball/i, { nome: 'Pokébola Airless', preco: 39.90, desc: 'Pokébola vazada em impressão 3D multicolor.' }],
  [/pokeball crochet/i, { nome: 'Pokébola Efeito Tricô', preco: 39.90, desc: 'Pokébola em impressão 3D multicolor com textura de tricô.' }],
  [/iron man pokeball/i, { nome: 'Pokébola Homem de Ferro', preco: 44.90, desc: 'Pokébola com tema do Homem de Ferro, em impressão 3D multicolor.' }],
  [/rayquaza pokeball/i, { nome: 'Pokébola Mega Rayquaza', preco: 44.90, desc: 'Pokébola com tema do Mega Rayquaza, em impressão 3D multicolor.' }],
];

const TEMAS = {
  'Inspired by Harry Potter': 'Inspirado em Harry Potter', 'Inspired by One Piece': 'Inspirado em One Piece',
  'Inspired by Dragon Ball': 'Inspirado em Dragon Ball', 'Inspired by Demon Slayer': 'Inspirado em Demon Slayer',
  'Inspired by Anime': 'Inspirado em Anime', 'Inspired by Attack on Titan': 'Inspirado em Attack on Titan',
  'Inspired by Super Hero': 'Inspirado em Super-Heróis', 'Inspired by Cartoon': 'Inspirado em desenhos animados',
  'Inspired by Pokemon': 'Inspirado em Pokémon', 'Inspired by Mario': 'Inspirado em Mario', 'Inspired by Sonic': 'Inspirado em Sonic',
  'Inspired by Naruto': 'Inspirado em Naruto', 'Inspired by Starwars': 'Inspirado em Star Wars', 'Inspired by Toy Story': 'Inspirado em Toy Story',
  'Inspired by Game': 'Inspirado em games', 'Inspired by Bluey': 'Inspirado em Bluey', 'Inspired by Grinch': 'Inspirado no Grinch',
  'Inspired by Halloween': 'Inspirado em Halloween', 'Inspired by How to train your dragon': 'Inspirado em Como Treinar o Seu Dragão',
  'Inspired by K-Pop Demon Hunter': 'Inspirado em Guerreiras do K-Pop', 'Inspired by Digimon': 'Inspirado em Digimon',
};

// Nome em português (chave = nome já limpo, em minúsculas)
const NOMES = {
  'spider man': 'Homem-Aranha', 'joker': 'Coringa', 'supple man': 'Superman', 'golden frieza': 'Frieza Dourado',
  'summoned warrior': 'Sung Jinwoo (Solo Leveling)', 'rubber pirate': 'Pirata de Borracha', 'attack titan eren titan': 'Titã de Ataque (Eren)',
  'goku super saiyan 4 ssj4': 'Goku Super Saiyajin 4', 'bubbles': 'Lindinha', 'tigger': 'Tigrão', 'winnie the pooh': 'Ursinho Pooh',
  'chase paw patrol': 'Chase (Patrulha Canina)', 'the smurf': 'Smurf', 'judy hopps zootopia': 'Judy Hopps (Zootopia)',
  'nick wilde zootopia': 'Nick Wilde (Zootopia)', 'boo monster inc': 'Boo (Monstros S.A.)', 'angel sitting': 'Anjo Sentada',
  'angel stitch': 'Anjo', 'leroy red stitch': 'Leroy', 'stitch sitting': 'Stitch Sentado', 'perry the platypus flexible, articulated': 'Perry o Ornitorrinco Articulado',
  'shinobi turtle': 'Tartaruga Ninja', 'minions': 'Minion', 'yellow rex': 'Rex Amarelo', 'princess zelda': 'Princesa Zelda',
  'link the legend of zelda': 'Link (Zelda)', 'zero megaman x': 'Zero (Mega Man X)', 'max the grinch’s dog': 'Max (cão do Grinch)',
  'demogorgon stranger things': 'Demogorgon (Stranger Things)', 'halloween pumpkin deadpool': 'Abóbora Deadpool',
  'halloween pumpkin freddy fazbear': 'Abóbora Freddy Fazbear', 'freddy fazbear flexi articulated': 'Freddy Fazbear Articulado',
  'toothless dancing meme flexi': 'Banguela Dançando Articulado', 'toothless': 'Banguela', 'light fury': 'Fúria da Luz',
  'zoey huntrx kpop demon hunters': 'Zoey (Huntrix)', 'mira huntrx kpop demon hunters': 'Mira (Huntrix)', 'rumi huntrx kpop demon hunters': 'Rumi (Huntrix)',
  'sussy bird kpop demon hunters': 'Sussy Bird', 'santa luigi': 'Luigi Noel', 'santa mario': 'Mario Noel', 'princess peach': 'Princesa Peach',
  'mario mushroom': 'Cogumelo do Mario', 'luma star super mario': 'Estrela Luma', 'ash ketchum (satoshi)': 'Ash Ketchum',
  'charizard urban vibes': 'Charizard Urban', 'pikachu urban vibes': 'Pikachu Urban', 'squirtle urban vibes': 'Squirtle Urban',
  'bulbasaur urban vibes': 'Bulbasaur Urban', 'charmander urban vibes': 'Charmander Urban',
  'halloween pumpkin snorlax and munchlax pokemon pumpkin': 'Abóbora Snorlax e Munchlax', 'halloween pumpkin bulbasaur': 'Abóbora Bulbasaur',
  'gengar skeleton': 'Gengar Esqueleto', 'dugtrio collapsing': 'Dugtrio Desmoronando', 'krookodile swimming in water': 'Krookodile Nadando',
  'pikachu valentine': 'Pikachu Namorados', 'squirtle saxophone': 'Squirtle Saxofone', 'mandalorian': 'Mandaloriano',
  'stormtrooper first order': 'Stormtrooper (Primeira Ordem)', 'cowboy toys': 'Cowboy de Brinquedo', 'silver the hedgehog': 'Silver',
  'shadow the hedgehog': 'Shadow', 'sonic knuckles': 'Knuckles', 'sonic tails': 'Tails', 'jeff the land shark marvel rivals': 'Jeff, o Tubarão Terrestre',
  'bingo bluey': 'Bingo', 'derpy tiger': 'Derpy Tiger', 'cute pikachu': 'Pikachu', 'megaman': 'Mega Man', 'mega man x': 'Mega Man X',
  'levi ackerman': 'Levi Ackerman', 'cell': 'Cell', 'tanjiro demon slayer': 'Tanjiro', 'albus dumbledore': 'Alvo Dumbledore', 'dr. eggman sonic': 'Dr. Eggman',
};

// Limpa o título: tira formato (Knitted/Regular/Multipart/3mf...) e deixa só o personagem
function limpar(titulo) {
  let t = titulo.replace(/\[multipart update\]/i, '').replace(/_/g, ' ')
    .replace(/\b(knitted|crochet|tricot\w*)\b/gi, ' ')
    .replace(/\b(regular|verison|version|multiparts?|multicolor|3d printing|stl\s*&\s*3mf|parts\s*&\s*3mf|seperated parts\s*&?|fan art|no support|dragon ball)\b/gi, ' ')
    .replace(/^\s*pokemon\s+/i, ' ').replace(/\s-\s*sonic\s*$/i, ' ').replace(/\(\s*\)/g, ' ');
  t = t.replace(/[-–&]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^pokemon\s+/i, '');
  if (t === t.toUpperCase()) t = t.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());   // TÍTULOS EM CAIXA ALTA
  return t;
}
const estiloDe = titulo => /knit|crochet/i.test(titulo) ? 'trico' : 'lisa';
const slug = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Agrupa: mesmo tema + mesmo personagem = um produto (versões tricô e lisa)
const grupos = new Map();
const ignorados = [], repetidos = [];
for (const m of modelos) {
  if (FORA.test(m.titulo)) { ignorados.push(m.titulo); continue; }
  if (!m.fotos.length) { ignorados.push(m.titulo + ' (sem fotos)'); continue; }
  const tema0 = TEMAS[m.colecao] || 'Inspirado em ' + m.colecao.replace(/^Inspired by /, '');
  const item = (ITENS.find(([re]) => re.test(m.titulo)) || [])[1];
  if (item) { grupos.set('item|' + item.nome, { nome: item.nome, tema: tema0, item, versoes: { [estiloDe(m.titulo)]: m } }); continue; }
  const base = limpar(m.titulo);
  const nome = NOMES[base.toLowerCase()] || base;
  const tema = TEMAS[m.colecao] || 'Inspirado em ' + m.colecao.replace(/^Inspired by /, '');
  const chave = tema + '|' + nome.toLowerCase();
  if (!grupos.has(chave)) grupos.set(chave, { nome, tema, versoes: {} });
  const g = grupos.get(chave), est = estiloDe(m.titulo);
  if (g.versoes[est]) { repetidos.push(m.titulo); continue; }   // mesmo personagem e acabamento: fica o primeiro
  g.versoes[est] = m;
}

const produtos = [], fotos = [], ids = new Set();
for (const g of grupos.values()) {
  let id = 'fa-' + slug(g.nome);
  while (ids.has(id)) id += '-2';
  ids.add(id);
  const ests = ['trico', 'lisa'].filter(e => g.versoes[e]);
  const capa = {}, galeria = [];
  for (const e of ests) {
    const m = g.versoes[e], letra = e === 'trico' ? 't' : 'l';
    m.fotos.forEach((f, n) => {
      const destino = `imagens/fanart/${id}-${letra}${n}.webp`;
      fotos.push({ de: f, para: destino, lado: 1000 });
      galeria.push(destino);
      if (n === 0) { capa[e] = `imagens/fanart/c/${id}-${letra}.webp`; fotos.push({ de: f, para: capa[e], lado: 480 }); }
    });
  }
  const it = g.item;
  const p = {
    id, criado: CRIADO, nome: it ? it.nome : ests.length === 1 && ests[0] === 'trico' ? `${g.nome} Efeito Tricô` : g.nome,
    categoria: 'fanart', fanart: true, tema: g.tema, preco: it ? it.preco : Math.min(...ests.map(e => precoDe(g.nome, e))),
    descricao: it ? it.desc : (ests.length === 2 ? 'Impressão 3D multicolor. Escolha a versão com efeito tricô ou a versão lisa.'
      : ests[0] === 'trico' ? 'Impressão 3D multicolor com textura de tricô.' : 'Impressão 3D multicolor.'),
    imagem: capa[ests[0]], fotos: galeria,
  };
  if (it && it.formatos) {
    p.estilo = ests[0];
    p.variacao = 'Formato';
    p.variantes = it.formatos.map(([nome, preco]) => ({ nome, preco, imagem: capa[ests[0]] }));
  } else if (!it) {
    // Bonecos: cada acabamento (tricô/lisa) em dois tamanhos, Grande e Pequeno (o tamanho em cm não aparece no site)
    const nomeEstilo = { trico: 'Tricô', lisa: 'Lisa' };
    p.variacao = ests.length === 2 ? 'Versão' : 'Tamanho';
    p.variantes = ests.flatMap(e => [
      { nome: ests.length === 2 ? `${nomeEstilo[e]} · Grande` : 'Grande', estilo: e, preco: precoDe(g.nome, e), imagem: capa[e] },
      { nome: ests.length === 2 ? `${nomeEstilo[e]} · Pequeno` : 'Pequeno', estilo: e, preco: precoDe(g.nome, e, true), imagem: capa[e] },
    ]);
    p.preco = Math.min(...p.variantes.map(v => v.preco));
    p.descricao += ' Disponível nos tamanhos Grande e Pequeno.';
    if (ests.length === 1) p.estilo = ests[0];
  } else p.estilo = ests[0];
  produtos.push(p);
}

writeFileSync(new URL('../site/js/fanart.js', import.meta.url),
  '/* Gerado por scripts/gerar-fanart.mjs a partir das fotos do Whale 3D Studio. Não edite à mão. */\n' +
  'window.PRODUTOS_FANART = ' + JSON.stringify(produtos, null, 0).replace(/\},\{/g, '},\n{') + ';\n');
writeFileSync(new URL('./_fotos-fanart.json', import.meta.url), JSON.stringify({ pasta: PASTA, fotos }));

const porTema = {};
for (const p of produtos) porTema[p.tema] = (porTema[p.tema] || 0) + 1;
console.log(`${produtos.length} produtos (${produtos.filter(p => p.variacao === 'Versão').length} com tricô e lisa), ${fotos.length} fotos`);
console.log(porTema);
console.log(`Fora (não são bonecos ou sem foto): ${ignorados.length}`, ignorados);
console.log(`Repetidos ignorados: ${repetidos.length}`, repetidos);
