/**
 * guardrails.js - Camada de segurança e validação entre LLM e a lógica do sistema.
 * 
 * Protege contra:
 * 1. Prompt Injection e tentativas de jailbreak.
 * 2. Manipulação de preços, descontos ou gratuidade.
 * 3. Invocação de funções não cadastradas ou arbitrárias (impede eval e code execution).
 * 4. Quantidades ilegais (negativas, flutuantes, gigantes).
 * 5. Produtos inexistentes ou indisponíveis no dia.
 * 6. Personalizações ilegais (ex: ponto de carne em refrigerante ou frango malpassado).
 */

export class GuardrailsService {
  constructor(cardapioService, carrinhoService, entregaService) {
    this.cardapioService = cardapioService;
    this.carrinhoService = carrinhoService;
    this.entregaService = entregaService;

    // Lista estrita de ferramentas/ações que o agente pode solicitar
    this.acoesAutorizadas = new Set([
      'consultarCardapio',
      'consultarCarrinho',
      'adicionarItem',
      'removerItem',
      'alterarQuantidade',
      'personalizarItem',
      'calcularTotal',
      'definirEntrega',
      'definirFormaPagamento',
      'solicitarConfirmacao',
      'finalizarPedido',
      'limparCarrinho',
      'responderDuvidaGeral'
    ]);

    // Padrões maliciosos típicos de prompt injection e jailbreak
    this.padroesAtaque = [
      /ignore\s+(todas\s+)?as\s+(instru[cç][oõ]es|regras)/i,
      /voc[eê]\s+agora\s+[eé]\s+(um\s+)?(administrador|admin|root|god)/i,
      /pre[cç]o\s*(=|para|em)\s*(0|zero|gr[aá]tis)/i,
      /marmita\s+gr[aá]tis/i,
      /de\s+gra[cç]a/i,
      /system\s*prompt/i,
      /mostre\s+(seu|o)\s+prompt/i,
      /execute\s+(este\s+)?(c[oó]digo|javascript|eval)/i,
      /<script[\s>]/i,
      /javascript:/i,
      /DROP\s+TABLE/i,
      /bypass/i
    ];
  }

  /**
   * Analisa a mensagem do usuário antes de repassar à LLM para identificar possíveis abusos.
   */
  inspecionarMensagemUsuario(texto) {
    if (!texto || typeof texto !== 'string') {
      return { seguro: true, textoHigienizado: '' };
    }

    const t = texto.trim();
    for (const regex of this.padroesAtaque) {
      if (regex.test(t)) {
        return {
          seguro: false,
          motivo: 'Tentativa de manipulação de instruções, gratuidade indevida ou injeção detectada.',
          respostaSegura: 'Sou o assistente virtual do Sabor Caseiro e não posso alterar as regras, preços ou conceder itens grátis. Posso te ajudar a escolher uma marmita deliciosa do nosso cardápio de hoje!'
        };
      }
    }

    // Higienização básica contra tags HTML
    const textoHigienizado = t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return { seguro: true, textoHigienizado };
  }

  /**
   * Valida a estrutura JSON retornada pelo LLM.
   * Garante que não haja eval() e que todos os campos e ações sejam permitidos.
   */
  validarAcaoLLM(acaoObjeto) {
    if (!acaoObjeto || typeof acaoObjeto !== 'object') {
      return { valido: false, erro: 'Resposta da LLM não é um objeto JSON válido.' };
    }

    const { action } = acaoObjeto;
    if (!action || typeof action !== 'string') {
      return { valido: false, erro: 'Campo "action" ausente ou inválido.' };
    }

    if (!this.acoesAutorizadas.has(action)) {
      return {
        valido: false,
        erro: `Ação "${action}" não é autorizada no sistema. Ações permitidas: ${Array.from(this.acoesAutorizadas).join(', ')}.`
      };
    }

    // Validações específicas por ação
    switch (action) {
      case 'adicionarItem':
        return this.validarAdicaoItem(acaoObjeto);

      case 'removerItem':
      case 'alterarQuantidade':
        return this.validarAlteracaoQuantidade(acaoObjeto);

      case 'personalizarItem':
        return this.validarPersonalizacao(acaoObjeto);

      case 'definirEntrega':
        return this.validarDefinicaoEntrega(acaoObjeto);

      case 'finalizarPedido':
        return this.validarFinalizacao(acaoObjeto);

      case 'consultarCardapio':
      case 'consultarCarrinho':
      case 'calcularTotal':
      case 'limparCarrinho':
      case 'definirFormaPagamento':
      case 'solicitarConfirmacao':
      case 'responderDuvidaGeral':
        return { valido: true, acao: acaoObjeto };

      default:
        return { valido: false, erro: `Ação não tratada: ${action}` };
    }
  }

  validarAdicaoItem(obj) {
    const { produto, quantidade, personalizacoes } = obj;

    // Buscar produto
    const prod = this.cardapioService.buscarProdutoPorTermo(produto) || this.cardapioService.getProdutoPorId(produto);
    if (!prod) {
      return { valido: false, erro: `Produto "${produto}" não existe no cardápio do restaurante.` };
    }

    // Verificar se está ativo e disponível hoje
    if (!this.cardapioService.isDisponivelHoje(prod.id)) {
      const hoje = this.cardapioService.getNomeDiaAtual();
      return {
        valido: false,
        erro: `O item "${prod.nome}" não está disponível hoje (${hoje}).`,
        sugestaoAlternativa: this.obterSugestaoAlternativa(prod.categoria)
      };
    }

    // Validar quantidade
    const qtd = Number(quantidade !== undefined ? quantidade : 1);
    if (!Number.isInteger(qtd) || qtd <= 0) {
      return { valido: false, erro: `Quantidade inválida: "${quantidade}". A quantidade deve ser um número inteiro positivo.` };
    }
    if (qtd > 50) {
      return { valido: false, erro: 'Quantidade excessivamente grande para um pedido único (máximo permitido: 50).' };
    }

    // Validar se tentou injetar preço ou desconto
    if (obj.preco !== undefined || obj.precoCentavos !== undefined || obj.desconto !== undefined) {
      return { valido: false, erro: 'Tentativa de alteração direta de preço ou desconto bloqueada pela segurança.' };
    }

    // Validar personalizações
    if (personalizacoes) {
      const erroPers = this.verificarConsistenciaPersonalizacoes(prod, personalizacoes);
      if (erroPers) {
        return { valido: false, erro: erroPers };
      }
    }

    return { valido: true, acao: { ...obj, produtoId: prod.id, quantidade: qtd } };
  }

  validarAlteracaoQuantidade(obj) {
    if (!obj.produto && !obj.idItem) {
      return { valido: false, erro: 'Produto não informado para alteração.' };
    }
    if (obj.action === 'alterarQuantidade') {
      const qtd = Number(obj.quantidade);
      if (!Number.isInteger(qtd) || qtd < 0 || qtd > 50) {
        return { valido: false, erro: 'Quantidade deve ser um número inteiro entre 0 e 50.' };
      }
    }
    return { valido: true, acao: obj };
  }

  validarPersonalizacao(obj) {
    const { identificador, personalizacoes } = obj;
    if (!personalizacoes || typeof personalizacoes !== 'object') {
      return { valido: false, erro: 'Estrutura de personalização ausente ou inválida.' };
    }

    // Se tiver produtos no carrinho, validar coerência
    const itens = this.carrinhoService.itens;
    if (itens.length === 0) {
      return { valido: false, erro: 'Não há itens no carrinho para personalizar.' };
    }

    return { valido: true, acao: obj };
  }

  validarDefinicaoEntrega(obj) {
    const { tipo, regiao } = obj;
    if (tipo === 'retirada') {
      return { valido: true, acao: obj };
    }

    if (!regiao && !obj.bairro) {
      return { valido: false, erro: 'É necessário informar o bairro ou região para entrega.' };
    }

    const regNome = regiao || obj.bairro;
    const regObj = this.entregaService.buscarRegiao(regNome);
    if (!regObj) {
      const atendidas = this.entregaService.getRegioes().map(r => r.nome).join(', ');
      return {
        valido: false,
        erro: `A região "${regNome}" não é atendida. Regiões disponíveis: ${atendidas} ou Retirada.`
      };
    }

    return { valido: true, acao: { ...obj, regiaoId: regObj.id } };
  }

  validarFinalizacao(obj) {
    if (this.carrinhoService.itens.length === 0) {
      return { valido: false, erro: 'Não é possível finalizar um pedido vazio.' };
    }
    if (!this.carrinhoService.isEntregaDefinida()) {
      return { valido: false, erro: 'Antes de finalizar, informe o endereço de entrega ou retirada.' };
    }
    return { valido: true, acao: obj };
  }

  verificarConsistenciaPersonalizacoes(produto, pers) {
    // 1. Ponto de cozimento em produtos incompatíveis
    if (pers.ponto) {
      if (!produto.opcoesPersonalizacao || !produto.opcoesPersonalizacao.permitePonto) {
        return `O produto "${produto.nome}" não aceita especificação de ponto da carne.`;
      }
      const pNorm = String(pers.ponto).toLowerCase().trim();
      if (!produto.opcoesPersonalizacao.pontosPermitidos.includes(pNorm)) {
        return `Ponto "${pers.ponto}" não reconhecido para carne. Escolha entre: ${produto.opcoesPersonalizacao.pontosPermitidos.join(', ')}.`;
      }
    }

    // 2. Remoção de ingredientes não cadastrados
    if (pers.remover && Array.isArray(pers.remover)) {
      const removiveis = produto.opcoesPersonalizacao ? produto.opcoesPersonalizacao.removiveis || [] : [];
      for (const ing of pers.remover) {
        const norm = String(ing).toLowerCase().trim();
        const existe = removiveis.some(r => r.toLowerCase() === norm || norm.includes(r.toLowerCase()));
        if (!existe) {
          return `O ingrediente "${ing}" não pode ser removido pois não faz parte das personalizações de "${produto.nome}".`;
        }
      }
    }

    return null;
  }

  obterSugestaoAlternativa(categoria) {
    const disponiveis = this.cardapioService.getCardapioDoDia().filter(p => p.categoria === categoria);
    if (disponiveis.length > 0) {
      return disponiveis.map(p => `${p.nome} (${CardapioService.formatarPreco(p.precoCentavos)})`).join(', ');
    }
    return 'Consulte o cardápio do dia para ver as opções disponíveis.';
  }
}
