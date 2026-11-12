/**
 * agent.js - Orquestrador do Agente Inteligente de Vendas
 * 
 * Gerencia o ciclo de vida completo de cada mensagem:
 * 1. Recebe a mensagem do usuário
 * 2. Aciona guardrails de entrada
 * 3. Prepara o contexto dinâmico do restaurante
 * 4. Dispara a inferência na LLM
 * 5. Valida a ação proposta pela LLM através dos guardrails
 * 6. Executa as ferramentas do sistema (Tools)
 * 7. Atualiza o estado da aplicação e formula a resposta fidedigna final
 */

import { construirContextoPrompt } from './prompts.js';

export class AgentService {
  constructor({ cardapioService, carrinhoService, entregaService, guardrailsService, toolsService, llmService }) {
    this.cardapioService = cardapioService;
    this.carrinhoService = carrinhoService;
    this.entregaService = entregaService;
    this.guardrailsService = guardrailsService;
    this.toolsService = toolsService;
    this.llmService = llmService;

    this.historicoConversa = [];
  }

  getHistorico() {
    return [...this.historicoConversa];
  }

  setHistorico(hist) {
    this.historicoConversa = Array.isArray(hist) ? hist : [];
  }

  limparHistorico() {
    this.historicoConversa = [];
  }

  /**
   * Processa a mensagem do usuário cumprindo rigorosamente os 10 passos do fluxo do agente
   */
  async processarMensagem(textoMensagem) {
    // 1. Guardrail de entrada: higienização e prevenção contra prompt injection
    const inspecao = this.guardrailsService.inspecionarMensagemUsuario(textoMensagem);
    if (!inspecao.seguro) {
      const respostaSegura = inspecao.respostaSegura;
      this.historicoConversa.push(
        { origem: 'usuario', texto: textoMensagem, timestamp: new Date().toISOString() },
        { origem: 'bot', texto: respostaSegura, timestamp: new Date().toISOString(), seguro: false }
      );
      return {
        texto: respostaSegura,
        acaoExecutada: 'bloqueio_guardrail',
        sucesso: false,
        motivo: inspecao.motivo
      };
    }

    // 2. Construção do contexto dinâmico do restaurante
    const contextoDinamico = construirContextoPrompt(
      this.cardapioService,
      this.carrinhoService,
      this.entregaService
    );

    // 3. Chamada à LLM para interpretação semântica e intenção
    let respostaLLM;
    try {
      respostaLLM = await this.llmService.gerarResposta({
        historicoMensagens: this.historicoConversa,
        contextoDinamico,
        mensagemAtual: inspecao.textoHigienizado
      });
    } catch (e) {
      console.error('[AgentService] Falha na comunicação com a LLM:', e);
      const msgErro = 'Tive uma breve instabilidade ao processar sua mensagem. Por favor, tente novamente!';
      return { texto: msgErro, acaoExecutada: 'erro_llm', sucesso: false };
    }

    // 4. Validação da ação proposta pelo modelo através dos guardrails
    const validacao = this.guardrailsService.validarAcaoLLM(respostaLLM);

    if (!validacao.valido) {
      console.warn('[AgentService] Ação da LLM bloqueada pelos guardrails:', validacao.erro);
      const respostaBloqueio = `${validacao.erro} ${validacao.sugestaoAlternativa ? 'Você pode escolher: ' + validacao.sugestaoAlternativa : 'Como posso te ajudar?'}`;
      
      this.historicoConversa.push(
        { origem: 'usuario', texto: textoMensagem, timestamp: new Date().toISOString() },
        { origem: 'bot', texto: respostaBloqueio, timestamp: new Date().toISOString() }
      );

      return {
        texto: respostaBloqueio,
        acaoExecutada: 'bloqueio_validacao',
        sucesso: false,
        detalhes: validacao.erro
      };
    }

    // 5. Execução da ferramenta autorizada (Tools)
    const acao = validacao.acao;
    const resultadoExecucao = await this.executarFerramenta(acao);

    // 6. Formulação da resposta final fidedigna (baseada no resultado REAL da função)
    const respostaFinal = this.formularRespostaFinal(acao, resultadoExecucao, respostaLLM.mensagem);

    // 7. Atualiza histórico da conversa
    this.historicoConversa.push(
      { origem: 'usuario', texto: textoMensagem, timestamp: new Date().toISOString() },
      { origem: 'bot', texto: respostaFinal, timestamp: new Date().toISOString(), acao: acao.action }
    );

    return {
      texto: respostaFinal,
      acaoExecutada: acao.action,
      parametros: acao.parametros || {},
      resultado: resultadoExecucao,
      sucesso: resultadoExecucao ? resultadoExecucao.sucesso !== false : true,
      pensamento: respostaLLM.pensamento || null
    };
  }

  /**
   * Executa a ferramenta mapeada com base na ação validada
   */
  async executarFerramenta(acao) {
    const { action, parametros = {} } = acao;

    switch (action) {
      case 'consultarCardapio':
        return this.toolsService.consultarCardapio();

      case 'consultarCarrinho':
        return this.toolsService.consultarCarrinho();

      case 'adicionarItem': {
        const res = this.toolsService.adicionarItem({
          produto: acao.produtoId || parametros.produto || acao.produto,
          quantidade: acao.quantidade || parametros.quantidade || 1,
          personalizacoes: acao.personalizacoes || parametros.personalizacoes || {}
        });

        // Caso haja item extra (ex: "duas de bife e um refri")
        if (parametros.itemExtra) {
          this.toolsService.adicionarItem({
            produto: parametros.itemExtra.produto,
            quantidade: parametros.itemExtra.quantidade || 1
          });
        }
        return res;
      }

      case 'removerItem':
        return this.toolsService.removerItem({
          produto: parametros.produto || acao.produto,
          idItem: parametros.idItem || acao.idItem
        });

      case 'alterarQuantidade':
        return this.toolsService.alterarQuantidade({
          produto: parametros.produto || acao.produto,
          idItem: parametros.idItem || acao.idItem,
          quantidade: parametros.quantidade || acao.quantidade
        });

      case 'personalizarItem':
        return this.toolsService.personalizarItem({
          identificador: parametros.identificador || acao.identificador || '1',
          personalizacoes: parametros.personalizacoes || acao.personalizacoes || {}
        });

      case 'definirEntrega':
        return this.toolsService.definirEntrega({
          tipo: parametros.tipo || acao.tipo,
          regiao: parametros.regiao || acao.regiao || parametros.bairro || acao.bairro,
          endereco: parametros.endereco || acao.endereco,
          numero: parametros.numero || acao.numero,
          complemento: parametros.complemento || acao.complemento,
          clienteNome: parametros.clienteNome || acao.clienteNome
        });

      case 'definirFormaPagamento':
        return this.toolsService.definirFormaPagamento({
          forma: parametros.forma || acao.forma
        });

      case 'solicitarConfirmacao':
        return this.toolsService.solicitarConfirmacao();

      case 'finalizarPedido':
        return this.toolsService.finalizarPedido({
          confirmado: parametros.confirmado === true || acao.confirmado === true
        });

      case 'limparCarrinho':
        return this.toolsService.limparCarrinho();

      case 'responderDuvidaGeral':
      default:
        return { sucesso: true };
    }
  }

  /**
   * Garante que a resposta exibida ao usuário reflita o estado real e não invenções da LLM
   */
  formularRespostaFinal(acao, resultado, mensagemOriginal) {
    if (!resultado) return mensagemOriginal || 'Operação realizada com sucesso.';

    if (resultado.sucesso === false) {
      return resultado.erro || resultado.mensagem || 'Não foi possível concluir a operação solicitada.';
    }

    switch (acao.action) {
      case 'consultarCardapio': {
        if (!resultado.aberto) return resultado.mensagem;
        const lista = resultado.produtos.map(p => `• **${p.nome}** (${p.precoFormatado}): ${p.descricao}`).join('\n');
        return `${mensagemOriginal || 'Aqui está o nosso cardápio de hoje:'}\n\n${lista}\n\nQual opção você gostaria de pedir?`;
      }

      case 'consultarCarrinho': {
        const res = resultado.resumo;
        if (!res || res.itens.length === 0) {
          return 'Seu carrinho está vazio no momento. Que tal dar uma olhada no nosso cardápio do dia?';
        }
        const itensTexto = res.itens.map(i => {
          let detalhePers = '';
          if (i.personalizacoes) {
            const partes = [];
            if (i.personalizacoes.ponto) partes.push(`ponto: ${i.personalizacoes.ponto}`);
            if (i.personalizacoes.removidos && i.personalizacoes.removidos.length > 0) {
              partes.push(`sem: ${i.personalizacoes.removidos.join(', ')}`);
            }
            if (partes.length > 0) detalhePers = ` (${partes.join(' | ')})`;
          }
          return `• ${i.quantidade}x ${i.nome} - ${i.subtotal}${detalhePers}`;
        }).join('\n');

        return `📋 **Seu Pedido Atual:**\n${itensTexto}\n\n**Subtotal:** ${res.subtotalFormatado}\n**Taxa de Entrega:** ${res.taxaEntregaFormatada}${!res.entregaDefinida ? ' *(região a definir)*' : ''}\n**Total:** ${res.totalFormatado}`;
      }

      case 'adicionarItem': {
        const resumo = this.carrinhoService.getResumo();
        const msgBase = mensagemOriginal || resultado.mensagem;
        return `${msgBase}\n\n*(Subtotal atual do carrinho: ${resumo.subtotalFormatado})*`;
      }

      case 'definirEntrega': {
        const resumo = this.carrinhoService.getResumo();
        return `${resultado.mensagem}\n\nO valor total do pedido com a taxa é de **${resumo.totalFormatado}**. Deseja confirmar seu pedido?`;
      }

      case 'finalizarPedido': {
        if (resultado.requerConfirmacao) {
          return resultado.mensagem;
        }
        return resultado.mensagem;
      }

      case 'solicitarConfirmacao': {
        if (resultado.requerConfirmacao) {
          return resultado.mensagem;
        }
        return mensagemOriginal || 'Por favor, revise o valor total e confirme para que possamos registrar seu pedido.';
      }

      default:
        return mensagemOriginal || 'Entendido!';
    }
  }
}
