/* Frete por região. Os valores ficam em dados/frete.json (o servidor de pagamento usa o mesmo arquivo). */
(function () {
  const REGIAO = {
    SP: 'Sudeste', RJ: 'Sudeste', MG: 'Sudeste', ES: 'Sudeste', PR: 'Sul', SC: 'Sul', RS: 'Sul',
    DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
    BA: 'Nordeste', SE: 'Nordeste', AL: 'Nordeste', PE: 'Nordeste', PB: 'Nordeste', RN: 'Nordeste', CE: 'Nordeste', PI: 'Nordeste', MA: 'Nordeste',
    PA: 'Norte', AP: 'Norte', AM: 'Norte', RR: 'Norte', AC: 'Norte', RO: 'Norte', TO: 'Norte',
  };
  let tabela = null;
  const pronto = fetch('dados/frete.json', { cache: 'no-cache' })
    .then(r => r.json()).then(t => { tabela = t; return t; })
    .catch(() => null); // aberto direto do arquivo (file://): frete fica "a calcular"
  window.NMKFrete = {
    pronto,
    regiao: uf => REGIAO[String(uf || '').toUpperCase()] || null,
    prazo: () => (tabela && tabela.prazo) || '',
    // mesmo cálculo de servidor/frete.mjs
    calcular(uf, subtotal) {
      uf = String(uf || '').toUpperCase();
      if (!tabela || !REGIAO[uf]) return null;
      if (tabela.gratisAcima > 0 && subtotal >= tabela.gratisAcima) return 0;
      const v = (tabela.porUF || {})[uf] ?? (tabela.porRegiao || {})[REGIAO[uf]];
      return typeof v === 'number' && v >= 0 ? Math.round(v * 100) / 100 : null;
    },
    gratisAcima: () => (tabela && tabela.gratisAcima) || 0,
  };
})();
