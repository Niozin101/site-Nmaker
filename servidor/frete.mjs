// Cálculo do frete (o mesmo usado na tela do carrinho, em site/js/frete.js)
import tabela from '../site/dados/frete.json' with { type: 'json' };

export const REGIAO = {
  SP: 'Sudeste', RJ: 'Sudeste', MG: 'Sudeste', ES: 'Sudeste',
  PR: 'Sul', SC: 'Sul', RS: 'Sul',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  BA: 'Nordeste', SE: 'Nordeste', AL: 'Nordeste', PE: 'Nordeste', PB: 'Nordeste', RN: 'Nordeste', CE: 'Nordeste', PI: 'Nordeste', MA: 'Nordeste',
  PA: 'Norte', AP: 'Norte', AM: 'Norte', RR: 'Norte', AC: 'Norte', RO: 'Norte', TO: 'Norte',
};

/** Devolve o frete em reais para o estado (UF) e o valor dos produtos, ou null se a UF não existe. */
export function calcularFrete(uf, subtotal, t = tabela) {
  uf = String(uf || '').toUpperCase();
  if (!REGIAO[uf]) return null;
  if (t.gratisAcima > 0 && subtotal >= t.gratisAcima) return 0;
  const valor = t.porUF?.[uf] ?? t.porRegiao?.[REGIAO[uf]];
  return typeof valor === 'number' && valor >= 0 ? Math.round(valor * 100) / 100 : null;
}
