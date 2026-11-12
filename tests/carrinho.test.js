/**
 * carrinho.test.js - Testes unitários das regras de negócio do carrinho de compras
 */

import { CardapioService } from '../js/cardapio.js';
import { EntregaService } from '../js/entrega.js';
import { CarrinhoService } from '../js/carrinho.js';

export function runCarrinhoTests() {
  const suite = { nome: 'CarrinhoService Tests', resultados: [] };

  function assert(cond, desc) {
    suite.resultados.push({ descricao: desc, passou: !!cond });
  }

  // Setup
  const cardapio = new CardapioService();
  cardapio.setDados(cardapio.getFallbackData());
  cardapio.setDiaSimulado(3); // Quarta-feira

  const entrega = new EntregaService();
  entrega.setDados(entrega.getFallbackData());

  const carrinho = new CarrinhoService(cardapio, entrega);

  // Teste 1: Adicionar produto disponível
  const res1 = carrinho.adicionarItem('marmita_bife', 2);
  assert(res1.sucesso === true, 'Deve adicionar 2 marmitas de bife');
  assert(carrinho.calcularSubtotalCentavos() === 5000, 'Subtotal de 2 marmitas de R$ 25,00 deve ser R$ 50,00 (5000 centavos)');

  // Teste 2: Adicionar personalização distinta mantendo itens separados
  const res2 = carrinho.adicionarItem('marmita_bife', 1, { ponto: 'bem passado', remover: ['cebola'] });
  assert(res2.sucesso === true, 'Deve adicionar marmita de bife personalizada');
  assert(carrinho.itens.length === 2, 'Marmitas com personalizações diferentes devem ser itens separados no carrinho');

  // Teste 3: Alterar quantidade
  const res3 = carrinho.alterarQuantidade('marmita_bife', 3);
  assert(res3.sucesso === true, 'Deve alterar a quantidade do primeiro item de bife para 3');

  // Teste 4: Remover item
  const res4 = carrinho.removerItem('marmita_bife');
  assert(res4.sucesso === true, 'Deve remover o item de bife');

  // Teste 5: Cálculo do total com entrega
  entrega.definirEntrega({ regiao: 'Bairro A' });
  const total = carrinho.calcularTotalCentavos();
  const subtotal = carrinho.calcularSubtotalCentavos();
  assert(total === subtotal + 700, 'Total deve ser a soma do subtotal mais R$ 7,00 (700 centavos) de entrega no Bairro A');

  // Teste 6: Limpar carrinho
  carrinho.limparCarrinho();
  assert(carrinho.itens.length === 0, 'Carrinho deve ficar vazio após limpar');
  assert(carrinho.calcularSubtotalCentavos() === 0, 'Subtotal zerado');

  return suite;
}
