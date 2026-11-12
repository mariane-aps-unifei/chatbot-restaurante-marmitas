/**
 * carrinho.js - Módulo de gerenciamento do carrinho de compras
 * Todos os cálculos financeiros são realizados em centavos exclusivamente pelo JavaScript.
 * Suporta múltiplos itens, itens idênticos com personalizações diferentes, subtotais e taxas.
 */

import { CardapioService } from './cardapio.js';

export class CarrinhoService {
  constructor(cardapioService, entregaService) {
    this.cardapioService = cardapioService;
    this.entregaService = entregaService;
    this.itens = []; // Lista de itens: { idItemUnico, produtoId, nome, precoCentavos, quantidade, personalizacoes: { removidos: [], ponto: null, observacoes: '' }, subtotalCentavos }
    this.contadorItens = 1;
    this.statusPedido = 'aberto'; // 'aberto' | 'aguardando_confirmacao' | 'finalizado'
    this.pedidoFinalizado = null;
    this.formaPagamento = null;
  }

  gerarIdItem() {
    return `item_${Date.now()}_${this.contadorItens++}`;
  }

  /**
   * Adiciona um produto ao carrinho.
   * Se um item idêntico já existir COM AS MESMAS PERSONALIZAÇÕES, incrementa a quantidade.
   * Se tiver personalizações diferentes, adiciona como item separado.
   */
  adicionarItem(produtoId, quantidade = 1, personalizacoes = {}) {
    const qtd = parseInt(quantidade, 10);
    if (isNaN(qtd) || qtd <= 0) {
      return { sucesso: false, erro: 'Quantidade inválida para adicionar.' };
    }

    const produto = this.cardapioService.getProdutoPorId(produtoId);
    if (!produto) {
      return { sucesso: false, erro: `Produto "${produtoId}" não encontrado no cardápio.` };
    }

    if (!this.cardapioService.isDisponivelHoje(produto.id)) {
      return {
        sucesso: false,
        erro: `O produto "${produto.nome}" não está disponível hoje (${this.cardapioService.getNomeDiaAtual()}).`
      };
    }

    // Normalização das personalizações
    const persNormalizada = this.normalizarPersonalizacoes(produto, personalizacoes);

    // Verifica se já existe um item com as mesmas personalizações exatas
    const itemExistente = this.itens.find(i => 
      i.produtoId === produto.id && 
      this.personalizacoesSaoIguais(i.personalizacoes, persNormalizada)
    );

    if (itemExistente) {
      itemExistente.quantidade += qtd;
      itemExistente.subtotalCentavos = itemExistente.quantidade * itemExistente.precoCentavos;
      return {
        sucesso: true,
        item: itemExistente,
        mensagem: `Atualizada a quantidade de ${itemExistente.nome} para ${itemExistente.quantidade}.`
      };
    }

    const novoItem = {
      idItemUnico: this.gerarIdItem(),
      produtoId: produto.id,
      nome: produto.nome,
      categoria: produto.categoria,
      precoCentavos: produto.precoCentavos,
      quantidade: qtd,
      personalizacoes: persNormalizada,
      subtotalCentavos: qtd * produto.precoCentavos
    };

    this.itens.push(novoItem);
    return {
      sucesso: true,
      item: novoItem,
      mensagem: `${qtd}x ${produto.nome} adicionado(a) ao carrinho.`
    };
  }

  /**
   * Normaliza e valida personalizações de acordo com as regras do produto
   */
  normalizarPersonalizacoes(produto, personalizacoes = {}) {
    const normalizadas = {
      removidos: [],
      ponto: null,
      observacoes: personalizacoes.observacoes || ''
    };

    // Validar ponto da carne
    if (produto.opcoesPersonalizacao && produto.opcoesPersonalizacao.permitePonto) {
      if (personalizacoes.ponto) {
        const pontoNorm = String(personalizacoes.ponto).toLowerCase().trim();
        if (produto.opcoesPersonalizacao.pontosPermitidos.includes(pontoNorm)) {
          normalizadas.ponto = pontoNorm;
        } else {
          normalizadas.ponto = produto.opcoesPersonalizacao.pontoPadrao || 'ao ponto';
        }
      } else {
        normalizadas.ponto = produto.opcoesPersonalizacao.pontoPadrao || 'ao ponto';
      }
    }

    // Validar itens a remover
    if (personalizacoes.remover || personalizacoes.removidos) {
      const removiveis = produto.opcoesPersonalizacao ? produto.opcoesPersonalizacao.removiveis || [] : [];
      const lista = Array.isArray(personalizacoes.remover) 
        ? personalizacoes.remover 
        : Array.isArray(personalizacoes.removidos) 
          ? personalizacoes.removidos 
          : [personalizacoes.remover];

      lista.forEach(ing => {
        const ingNorm = String(ing).toLowerCase().trim();
        const encontrado = removiveis.find(r => r.toLowerCase() === ingNorm || ingNorm.includes(r.toLowerCase()));
        if (encontrado && !normalizadas.removidos.includes(encontrado)) {
          normalizadas.removidos.push(encontrado);
        }
      });
    }

    // Sabor de bebida, se aplicável
    if (personalizacoes.sabor) {
      normalizadas.sabor = personalizacoes.sabor;
    }

    return normalizadas;
  }

  personalizacoesSaoIguais(p1, p2) {
    if (!p1 && !p2) return true;
    if (!p1 || !p2) return false;
    if (p1.ponto !== p2.ponto) return false;
    if (p1.sabor !== p2.sabor) return false;
    const r1 = (p1.removidos || []).slice().sort().join(',');
    const r2 = (p2.removidos || []).slice().sort().join(',');
    return r1 === r2;
  }

  /**
   * Remove itens do carrinho por ID do item, ou por ID do produto
   */
  removerItem(termoOuId) {
    if (!termoOuId) return { sucesso: false, erro: 'Identificador do produto não informado.' };

    const idxPorIdItem = this.itens.findIndex(i => i.idItemUnico === termoOuId);
    if (idxPorIdItem !== -1) {
      const removido = this.itens.splice(idxPorIdItem, 1)[0];
      return { sucesso: true, item: removido, mensagem: `${removido.nome} removido do carrinho.` };
    }

    // Busca por produtoId ou nome aproximado
    const prod = this.cardapioService.buscarProdutoPorTermo(termoOuId);
    const prodId = prod ? prod.id : termoOuId;

    const idxPorProd = this.itens.findIndex(i => i.produtoId === prodId);
    if (idxPorProd !== -1) {
      const removido = this.itens.splice(idxPorProd, 1)[0];
      return { sucesso: true, item: removido, mensagem: `${removido.nome} removido do carrinho.` };
    }

    return { sucesso: false, erro: `Item "${termoOuId}" não encontrado no seu carrinho.` };
  }

  /**
   * Altera a quantidade de um item no carrinho
   */
  alterarQuantidade(termoOuId, novaQuantidade) {
    const qtd = parseInt(novaQuantidade, 10);
    if (isNaN(qtd)) return { sucesso: false, erro: 'Quantidade numérica inválida.' };

    if (qtd <= 0) {
      return this.removerItem(termoOuId);
    }

    // Busca item
    let item = this.itens.find(i => i.idItemUnico === termoOuId);
    if (!item) {
      const prod = this.cardapioService.buscarProdutoPorTermo(termoOuId);
      const prodId = prod ? prod.id : termoOuId;
      item = this.itens.find(i => i.produtoId === prodId);
    }

    if (!item) {
      return { sucesso: false, erro: `Item "${termoOuId}" não encontrado no carrinho.` };
    }

    item.quantidade = qtd;
    item.subtotalCentavos = item.quantidade * item.precoCentavos;

    return {
      sucesso: true,
      item,
      mensagem: `Quantidade de ${item.nome} alterada para ${item.quantidade}.`
    };
  }

  /**
   * Personaliza um item existente no carrinho (por índice 1-based, idItemUnico ou termo)
   */
  personalizarItem(identificador, novasPersonalizacoes) {
    let item = null;

    // Se identificador for número ou string numérica (ex: 1 para "a primeira marmita")
    const num = parseInt(identificador, 10);
    if (!isNaN(num) && num > 0 && num <= this.itens.length) {
      item = this.itens[num - 1];
    } else if (identificador) {
      item = this.itens.find(i => i.idItemUnico === identificador);
      if (!item) {
        const prod = this.cardapioService.buscarProdutoPorTermo(identificador);
        const prodId = prod ? prod.id : identificador;
        item = this.itens.find(i => i.produtoId === prodId);
      }
    } else if (this.itens.length === 1) {
      item = this.itens[0];
    }

    if (!item) {
      return { sucesso: false, erro: 'Item para personalizar não encontrado.' };
    }

    const produto = this.cardapioService.getProdutoPorId(item.produtoId);
    const atual = item.personalizacoes || { removidos: [], ponto: null };

    // Mesclar personalizações
    const mescladas = {
      removidos: [
        ...(atual.removidos || []),
        ...(novasPersonalizacoes.remover || novasPersonalizacoes.removidos || [])
      ],
      ponto: novasPersonalizacoes.ponto || atual.ponto,
      observacoes: novasPersonalizacoes.observacoes || atual.observacoes
    };

    item.personalizacoes = this.normalizarPersonalizacoes(produto, mescladas);

    return {
      sucesso: true,
      item,
      mensagem: `Personalização atualizada para ${item.nome}.`
    };
  }

  limparCarrinho() {
    this.itens = [];
    this.statusPedido = 'aberto';
    this.formaPagamento = null;
    this.pedidoFinalizado = null;
    return { sucesso: true, mensagem: 'Carrinho limpo com sucesso.' };
  }

  setFormaPagamento(forma) {
    const permitidas = ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro'];
    const norm = String(forma).toLowerCase().trim().replace(/\s+/g, '_');
    
    let encontrada = null;
    if (norm.includes('pix')) encontrada = 'pix';
    else if (norm.includes('credito')) encontrada = 'cartao_credito';
    else if (norm.includes('debito')) encontrada = 'cartao_debito';
    else if (norm.includes('cartao')) encontrada = 'cartao_credito';
    else if (norm.includes('dinheiro')) encontrada = 'dinheiro';

    if (!encontrada) {
      return { sucesso: false, erro: 'Forma de pagamento inválida. Aceitamos Pix, Cartão de Crédito, Cartão de Débito ou Dinheiro.' };
    }

    this.formaPagamento = encontrada;
    return { sucesso: true, formaPagamento: this.formaPagamento, mensagem: `Forma de pagamento definida como ${encontrada.replace('_', ' ').toUpperCase()}.` };
  }

  calcularSubtotalCentavos() {
    return this.itens.reduce((total, item) => total + (item.subtotalCentavos || 0), 0);
  }

  getTaxaEntregaCentavos() {
    const estadoEntrega = this.entregaService ? this.entregaService.getEstado() : null;
    return (estadoEntrega && estadoEntrega.definido) ? estadoEntrega.taxaCentavos : 0;
  }

  calcularTotalCentavos() {
    return this.calcularSubtotalCentavos() + this.getTaxaEntregaCentavos();
  }

  isEntregaDefinida() {
    const estado = this.entregaService ? this.entregaService.getEstado() : null;
    return !!(estado && estado.definido);
  }

  /**
   * Retorna resumo estruturado e humanizado do carrinho
   */
  getResumo() {
    const subtotal = this.calcularSubtotalCentavos();
    const taxa = this.getTaxaEntregaCentavos();
    const total = this.calcularTotalCentavos();
    const entrega = this.entregaService ? this.entregaService.getEstado() : null;

    return {
      itens: this.itens.map(i => ({
        id: i.idItemUnico,
        nome: i.nome,
        quantidade: i.quantidade,
        precoUnitario: CardapioService.formatarPreco(i.precoCentavos),
        subtotal: CardapioService.formatarPreco(i.subtotalCentavos),
        personalizacoes: i.personalizacoes
      })),
      quantidadeTotalItens: this.itens.reduce((acc, i) => acc + i.quantidade, 0),
      subtotalFormatado: CardapioService.formatarPreco(subtotal),
      subtotalCentavos: subtotal,
      entregaDefinida: this.isEntregaDefinida(),
      taxaEntregaFormatada: CardapioService.formatarPreco(taxa),
      taxaEntregaCentavos: taxa,
      totalFormatado: CardapioService.formatarPreco(total),
      totalCentavos: total,
      detalhesEntrega: entrega,
      formaPagamento: this.formaPagamento,
      status: this.statusPedido
    };
  }

  /**
   * Finaliza o pedido após validação estrita dos pré-requisitos
   */
  finalizarPedido(confirmadoPeloUsuario = false) {
    if (this.itens.length === 0) {
      return {
        sucesso: false,
        erro: 'O carrinho está vazio. Adicione marmitas ou produtos antes de finalizar o pedido.'
      };
    }

    if (!this.isEntregaDefinida()) {
      return {
        sucesso: false,
        erro: 'É necessário definir a forma de entrega ou retirada antes de finalizar a compra.'
      };
    }

    if (!confirmadoPeloUsuario) {
      this.statusPedido = 'aguardando_confirmacao';
      return {
        sucesso: false,
        requerConfirmacao: true,
        resumo: this.getResumo(),
        mensagem: `Seu pedido ficou em ${CardapioService.formatarPreco(this.calcularTotalCentavos())}, incluindo a entrega. Você confirma a compra?`
      };
    }

    // Se confirmado, gera ID simulado
    const idPedido = `PED-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 899 + 100)}`;
    const resumo = this.getResumo();

    this.pedidoFinalizado = {
      idPedido,
      dataHora: new Date().toISOString(),
      resumo,
      simulacao: true
    };
    this.statusPedido = 'finalizado';

    return {
      sucesso: true,
      idPedido,
      pedido: this.pedidoFinalizado,
      mensagem: `🎉 Pedido ${idPedido} confirmado com sucesso na simulação acadêmica! Muito obrigado pela preferência no Sabor Caseiro.`
    };
  }

  // Serialização para storage
  exportarEstado() {
    return {
      itens: this.itens,
      formaPagamento: this.formaPagamento,
      statusPedido: this.statusPedido,
      pedidoFinalizado: this.pedidoFinalizado
    };
  }

  importarEstado(dados) {
    if (!dados) return;
    this.itens = dados.itens || [];
    this.formaPagamento = dados.formaPagamento || null;
    this.statusPedido = dados.statusPedido || 'aberto';
    this.pedidoFinalizado = dados.pedidoFinalizado || null;
  }
}
