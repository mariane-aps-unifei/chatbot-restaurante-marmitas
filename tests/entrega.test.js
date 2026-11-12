/**
 * entrega.test.js - Testes de cálculo de taxas de entrega e regiões
 */

import { EntregaService } from '../js/entrega.js';

export function runEntregaTests() {
  const suite = { nome: 'EntregaService Tests', resultados: [] };

  function assert(cond, desc) {
    suite.resultados.push({ descricao: desc, passou: !!cond });
  }

  const entrega = new EntregaService();
  entrega.setDados(entrega.getFallbackData());

  // Teste 1: Região válida Centro (R$ 5,00)
  const resCentro = entrega.definirEntrega({ regiao: 'Centro' });
  assert(resCentro.sucesso === true, 'Centro deve ser aceito');
  assert(resCentro.dados.taxaCentavos === 500, 'Taxa do Centro deve ser 500 centavos');

  // Teste 2: Região válida Bairro A (R$ 7,00)
  const resBairroA = entrega.definirEntrega({ regiao: 'Bairro A' });
  assert(resBairroA.sucesso === true, 'Bairro A deve ser aceito');
  assert(resBairroA.dados.taxaCentavos === 700, 'Taxa do Bairro A deve ser 700 centavos');

  // Teste 3: Retirada no balcão (R$ 0,00)
  const resRetirada = entrega.definirRetirada('Carlos');
  assert(resRetirada.tipo === 'retirada', 'Tipo deve ser retirada');
  assert(resRetirada.taxaCentavos === 0, 'Taxa de retirada deve ser 0');

  // Teste 4: Região não atendida
  const resInvalida = entrega.definirEntrega({ regiao: 'Bairro Inexistente XYZ' });
  assert(resInvalida.sucesso === false, 'Deve rejeitar região não cadastrada');

  return suite;
}
