/**
 * tools.js - Implementação das ferramentas/funções estruturadas que o agente pode executar.
 * 
 * Todas as operações reais no estado são disparadas por este módulo após validação dos guardrails.
 * A LLM apenas solicita a execução e os parâmetros; o JavaScript executa e retorna o resultado fidedigno.
 */

import { CardapioService } from './cardapio.js';

export class AgentTools {
  constructor(cardapioService, carrinhoService, entregaService, guardrailsService) {
    this.cardapioService = cardapioService;
    this.carrinhoService = carrinhoService;
    this.entregaService = entregaService;
    this.guardrailsService = guardrailsService;
  }

  /**
   * Consulta os produtos disponíveis no dia atual
   */
  consultarCardapio() {
    const diaNome = this.cardapioService.getNomeDiaAtual();
    const aberto = this.cardapioService.isAbertoHoje();

    if (!aberto) {
      return {
        sucesso: true,
        aberto: false,
        dia: diaNome,
        mensagem: `Hoje é ${diaNome} e o restaurante Sabor Caseiro está fechado para atendimento.`
      };
    }

    const produtos = this.cardapioService.getCardapioDoDia();
    return {
      sucesso: true,
      aberto: true,
      dia: diaNome,
      produtos: produtos.map(p => ({
        id: p.id,
        nome: p.nome,
        categoria: p.categoria,
        descricao: p.descricao,
        precoFormatado: CardapioService.formatarPreco(p.precoCentavos),
        precoCentavos: p.precoCentavos,
        ingredientes: p.ingredientes,
        personalizacoes: p.opcoesPersonalizacao
      }))
    };
  }

  /**
   * Adiciona um ou mais itens ao carrinho
   */
  adicionarItem({ produto, quantidade = 1, personalizacoes = {} }) {
    // Busca pelo ID ou nome
    const prod = this.cardapioService.buscarProdutoPorTermo(produto) || this.cardapioService.getProdutoPorId(produto);
    if (!prod) {
      return { sucesso: false, erro: `Produto "${produto}" não encontrado no cardápio.` };
    }

    const resultado = this.carrinhoService.adicionarItem(prod.id, quantidade, personalizacoes);
    if (resultado.sucesso) {
      return {
        sucesso: true,
        mensagem: resultado.mensagem,
        item: resultado.item,
        carrinhoResumo: this.carrinhoService.getResumo()
      };
    }
    return resultado;
  }

  /**
   * Remove um item do carrinho
   */
  removerItem({ produto, idItem }) {
    const alvo = idItem || produto;
    const resultado = this.carrinhoService.removerItem(alvo);
    return {
      ...resultado,
      carrinhoResumo: this.carrinhoService.getResumo()
    };
  }

  /**
   * Altera a quantidade de um item
   */
  alterarQuantidade({ produto, idItem, quantidade }) {
    const alvo = idItem || produto;
    const resultado = this.carrinhoService.alterarQuantidade(alvo, quantidade);
    return {
      ...resultado,
      carrinhoResumo: this.carrinhoService.getResumo()
    };
  }

  /**
   * Personaliza um item do carrinho (ponto, ingredientes removidos)
   */
  personalizarItem({ identificador, personalizacoes }) {
    const resultado = this.carrinhoService.personalizarItem(identificador, personalizacoes);
    return {
      ...resultado,
      carrinhoResumo: this.carrinhoService.getResumo()
    };
  }

  /**
   * Consulta o estado atual do carrinho
   */
  consultarCarrinho() {
    const resumo = this.carrinhoService.getResumo();
    return {
      sucesso: true,
      resumo
    };
  }

  /**
   * Calcula e retorna o subtotal, taxa e total atualizados
   */
  calcularTotal() {
    const resumo = this.carrinhoService.getResumo();
    return {
      sucesso: true,
      subtotal: resumo.subtotalFormatado,
      taxaEntrega: resumo.taxaEntregaFormatada,
      total: resumo.totalFormatado,
      entregaDefinida: resumo.entregaDefinida,
      resumo
    };
  }

  /**
   * Define se o pedido é para entrega ou retirada e calcula a taxa
   */
  definirEntrega({ tipo, regiao, endereco, numero, complemento, clienteNome }) {
    if (tipo === 'retirada' || (regiao && regiao.toLowerCase().includes('retirada'))) {
      const res = this.entregaService.definirRetirada(clienteNome);
      return {
        sucesso: true,
        tipo: 'retirada',
        mensagem: 'Pedido configurado para retirada no balcão do restaurante (sem taxa).',
        total: this.carrinhoService.getResumo().totalFormatado
      };
    }

    const resultado = this.entregaService.definirEntrega({
      regiao,
      endereco,
      numero,
      complemento,
      clienteNome
    });

    if (!resultado.sucesso) {
      return resultado;
    }

    return {
      sucesso: true,
      tipo: 'entrega',
      mensagem: resultado.mensagem,
      dadosEntrega: resultado.dados,
      totalAtualizado: this.carrinhoService.getResumo().totalFormatado
    };
  }

  /**
   * Define a forma de pagamento simulada
   */
  definirFormaPagamento({ forma }) {
    return this.carrinhoService.setFormaPagamento(forma);
  }

  /**
   * Limpa todos os itens do carrinho
   */
  limparCarrinho() {
    const res = this.carrinhoService.limparCarrinho();
    this.entregaService.limpar();
    return res;
  }

  /**
   * Solicita confirmação explícita do cliente antes de finalizar
   */
  solicitarConfirmacao() {
    return this.carrinhoService.finalizarPedido(false);
  }

  /**
   * Finaliza o pedido (apenas se confirmado)
   */
  finalizarPedido({ confirmado = false } = {}) {
    return this.carrinhoService.finalizarPedido(confirmado);
  }
}
