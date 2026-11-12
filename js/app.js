/**
 * app.js - Ponto de entrada da aplicação
 * Inicializa serviços, renderiza o cardápio e o carrinho, gerencia eventos e modal de configurações.
 */

import { CardapioService } from './cardapio.js';
import { EntregaService } from './entrega.js';
import { CarrinhoService } from './carrinho.js';
import { GuardrailsService } from './guardrails.js';
import { AgentTools } from './tools.js';
import { LLMService } from './llm.js';
import { AgentService } from './agent.js';
import { ChatbotUI } from './chatbot.js';
import { Storage } from './storage.js';

class App {
  constructor() {
    this.cardapioService = new CardapioService();
    this.entregaService = new EntregaService();
    this.carrinhoService = new CarrinhoService(this.cardapioService, this.entregaService);
    this.guardrailsService = new GuardrailsService(this.cardapioService, this.carrinhoService, this.entregaService);
    this.toolsService = new AgentTools(this.cardapioService, this.carrinhoService, this.entregaService, this.guardrailsService);
    this.llmService = new LLMService();
    
    this.agentService = new AgentService({
      cardapioService: this.cardapioService,
      carrinhoService: this.carrinhoService,
      entregaService: this.entregaService,
      guardrailsService: this.guardrailsService,
      toolsService: this.toolsService,
      llmService: this.llmService
    });

    this.chatbotUI = null;
  }

  async inicializar() {
    console.log('[App] Inicializando aplicação Sabor Caseiro...');

    // 1. Carregar dados de cardápio e entregas
    await Promise.all([
      this.cardapioService.inicializar(),
      this.entregaService.inicializar()
    ]);

    // 2. Restaurar persistência local (se houver)
    this.restaurarEstadoLocal();

    // 3. Configurar UI do Chatbot
    this.configurarChatbotUI();

    // 4. Configurar eventos de interface (botões de controle, modal LLM)
    this.configurarEventosUI();

    // 5. Renderizar cardápio do dia e carrinho inicial
    this.renderizarCardapio();
    this.renderizarCarrinho();

    // 6. Monitorar status do modelo LLM
    this.llmService.onStatusChange((statusInfo) => {
      this.atualizarStatusLLM(statusInfo);
    });

    // 7. Inicializar motor LLM
    await this.llmService.inicializar('auto');

    // 8. Mensagem inicial de boas-vindas
    this.apresentarBoasVindas();
  }

  configurarChatbotUI() {
    const containerChat = document.getElementById('chat-mensagens');
    const formInput = document.getElementById('chat-form');
    const campoTexto = document.getElementById('chat-input');
    const botaoEnviar = document.getElementById('chat-enviar');
    const digitandoIndicador = document.getElementById('digitando-indicador');

    this.chatbotUI = new ChatbotUI({
      containerChat,
      formInput,
      campoTexto,
      botaoEnviar,
      digitandoIndicador,
      onEnviarMensagem: async (texto) => {
        this.chatbotUI.mostrarDigitando(true);
        try {
          const resposta = await this.agentService.processarMensagem(texto);
          this.chatbotUI.mostrarDigitando(false);
          this.chatbotUI.adicionarMensagem(resposta.texto, 'bot');
          
          // Atualiza a visualização do carrinho e salva no storage
          this.renderizarCarrinho();
          this.salvarEstadoLocal();
        } catch (e) {
          console.error('[App] Erro ao processar:', e);
          this.chatbotUI.mostrarDigitando(false);
          this.chatbotUI.adicionarMensagem('Ocorreu um erro ao processar seu pedido. Por favor, tente novamente.', 'bot');
        }
      }
    });
  }

  configurarEventosUI() {
    // Sugestões rápidas
    const chips = document.querySelectorAll('.chip-sugestao');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt && this.chatbotUI) {
          this.chatbotUI.enviarTextoDireto(prompt);
        }
      });
    });

    // Seletor simulado de dia da semana (ótimo para testes e avaliação do professor)
    const seletorDia = document.getElementById('seletor-dia-semana');
    if (seletorDia) {
      seletorDia.value = String(this.cardapioService.getDiaAtual());
      seletorDia.addEventListener('change', (e) => {
        const dia = parseInt(e.target.value, 10);
        this.cardapioService.setDiaSimulado(dia);
        this.renderizarCardapio();
        if (this.chatbotUI) {
          this.chatbotUI.adicionarMensagem(`*Dia da semana alterado para ${this.cardapioService.getNomeDiaAtual()}. O cardápio foi atualizado!*`, 'bot');
        }
      });
    }

    // Botão Limpar Carrinho
    const btnLimpar = document.getElementById('btn-limpar-carrinho');
    if (btnLimpar) {
      btnLimpar.addEventListener('click', () => {
        if (confirm('Tem certeza de que deseja limpar todos os itens do carrinho?')) {
          this.carrinhoService.limparCarrinho();
          this.entregaService.limpar();
          this.renderizarCarrinho();
          this.salvarEstadoLocal();
          if (this.chatbotUI) {
            this.chatbotUI.adicionarMensagem('Seu carrinho foi limpo com sucesso.', 'bot');
          }
        }
      });
    }

    // Botão Nova Conversa
    const btnNovaConversa = document.getElementById('btn-nova-conversa');
    if (btnNovaConversa) {
      btnNovaConversa.addEventListener('click', () => {
        if (confirm('Deseja iniciar uma nova conversa e redefinir o atendimento?')) {
          this.agentService.limparHistorico();
          this.carrinhoService.limparCarrinho();
          this.entregaService.limpar();
          Storage.limparTudo();
          this.chatbotUI.limpar();
          this.renderizarCarrinho();
          this.apresentarBoasVindas();
        }
      });
    }

    // Modal de Configurações LLM
    const btnAbrirModal = document.getElementById('btn-config-llm');
    const modalConfig = document.getElementById('modal-config-llm');
    const btnFecharModal = document.getElementById('btn-fechar-modal');
    const formConfig = document.getElementById('form-config-llm');

    if (btnAbrirModal && modalConfig) {
      btnAbrirModal.addEventListener('click', () => {
        modalConfig.classList.add('ativo');
      });
    }

    if (btnFecharModal && modalConfig) {
      btnFecharModal.addEventListener('click', () => {
        modalConfig.classList.remove('ativo');
      });
    }

    if (formConfig) {
      formConfig.addEventListener('submit', (e) => {
        e.preventDefault();
        const provedor = document.getElementById('select-provedor-llm').value;
        const apiKey = document.getElementById('input-api-key').value.trim();

        if (provedor === 'webllm') {
          this.llmService.inicializar('webllm');
        } else if (provedor === 'local_rules') {
          this.llmService.inicializar('local_rules');
        } else if (apiKey) {
          this.llmService.configurarApiKey(provedor, apiKey);
        } else {
          alert('Por favor, informe uma chave de API válida para o provedor selecionado.');
          return;
        }

        modalConfig.classList.remove('ativo');
      });
    }
  }

  renderizarCardapio() {
    const container = document.getElementById('lista-cardapio');
    const badgeDia = document.getElementById('badge-dia-atual');
    if (!container) return;

    const diaNome = this.cardapioService.getNomeDiaAtual();
    if (badgeDia) badgeDia.textContent = diaNome;

    const produtos = this.cardapioService.getCardapioDoDia();
    if (produtos.length === 0) {
      container.innerHTML = `<div class="alerta-fechado">O restaurante não possui pratos disponíveis hoje (${diaNome}).</div>`;
      return;
    }

    container.innerHTML = produtos.map(p => `
      <div class="cardapio-item" data-id="${p.id}">
        <div class="cardapio-item-info">
          <div class="cardapio-item-cabecalho">
            <span class="cardapio-item-nome">${p.nome}</span>
            <span class="cardapio-item-preco">${CardapioService.formatarPreco(p.precoCentavos)}</span>
          </div>
          <p class="cardapio-item-desc">${p.descricao}</p>
          <div class="cardapio-item-tags">
            <span class="tag-categoria tag-${p.categoria}">${p.categoria}</span>
            ${p.opcoesPersonalizacao.permitePonto ? '<span class="tag-personalizacao">Permite ponto</span>' : ''}
            ${p.opcoesPersonalizacao.removiveis.length > 0 ? `<span class="tag-personalizacao">Personalizável</span>` : ''}
          </div>
        </div>
        <button class="btn-pedir-item" data-id="${p.id}" title="Pedir este prato pelo chat">Pedir</button>
      </div>
    `).join('');

    // Atalhos nos botões "Pedir" do cardápio
    container.querySelectorAll('.btn-pedir-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const prod = this.cardapioService.getProdutoPorId(id);
        if (prod && this.chatbotUI) {
          this.chatbotUI.enviarTextoDireto(`Quero pedir uma ${prod.nome}`);
        }
      });
    });
  }

  renderizarCarrinho() {
    const listaEl = document.getElementById('carrinho-itens');
    const subtotalEl = document.getElementById('carrinho-subtotal');
    const taxaEl = document.getElementById('carrinho-taxa-entrega');
    const totalEl = document.getElementById('carrinho-total');
    const contadorBadge = document.getElementById('carrinho-contador');

    if (!listaEl) return;

    const resumo = this.carrinhoService.getResumo();

    if (contadorBadge) {
      contadorBadge.textContent = resumo.quantidadeTotalItens;
      contadorBadge.style.display = resumo.quantidadeTotalItens > 0 ? 'inline-block' : 'none';
    }

    if (resumo.itens.length === 0) {
      listaEl.innerHTML = `
        <div class="carrinho-vazio">
          <span class="carrinho-vazio-icone">🛒</span>
          <p>Seu carrinho está vazio.</p>
          <small>Peça marmitas ou bebidas conversando no chat!</small>
        </div>
      `;
    } else {
      listaEl.innerHTML = resumo.itens.map(item => {
        let persHtml = '';
        if (item.personalizacoes) {
          const detalhes = [];
          if (item.personalizacoes.ponto) detalhes.push(`Ponto: ${item.personalizacoes.ponto}`);
          if (item.personalizacoes.removidos && item.personalizacoes.removidos.length > 0) {
            detalhes.push(`Sem: ${item.personalizacoes.removidos.join(', ')}`);
          }
          if (detalhes.length > 0) {
            persHtml = `<div class="item-personalizacoes">${detalhes.join(' • ')}</div>`;
          }
        }

        return `
          <div class="carrinho-item" data-id="${item.id}">
            <div class="carrinho-item-detalhes">
              <span class="carrinho-item-nome">${item.nome}</span>
              ${persHtml}
              <span class="carrinho-item-unitario">${item.quantidade}x ${item.precoUnitario}</span>
            </div>
            <div class="carrinho-item-valores">
              <span class="carrinho-item-subtotal">${item.subtotal}</span>
              <button class="btn-remover-item" data-id="${item.id}" title="Remover item">×</button>
            </div>
          </div>
        `;
      }).join('');

      // Evento de remoção rápida
      listaEl.querySelectorAll('.btn-remover-item').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-id');
          this.carrinhoService.removerItem(id);
          this.renderizarCarrinho();
          this.salvarEstadoLocal();
          if (this.chatbotUI) {
            this.chatbotUI.adicionarMensagem('Item removido do carrinho.', 'bot');
          }
        });
      });
    }

    if (subtotalEl) subtotalEl.textContent = resumo.subtotalFormatado;
    if (taxaEl) {
      taxaEl.textContent = resumo.entregaDefinida 
        ? `${resumo.taxaEntregaFormatada} (${resumo.detalhesEntrega.tipo === 'retirada' ? 'Retirada' : resumo.detalhesEntrega.regiaoNome})` 
        : 'A calcular';
    }
    if (totalEl) totalEl.textContent = resumo.totalFormatado;
  }

  atualizarStatusLLM(info) {
    const statusPill = document.getElementById('llm-status-pill');
    const statusTexto = document.getElementById('llm-status-texto');
    const barraProgresso = document.getElementById('llm-progresso-barra');
    const containerProgresso = document.getElementById('llm-progresso-container');

    if (statusPill) {
      statusPill.className = `status-pill status-${info.status}`;
    }
    if (statusTexto) {
      statusTexto.textContent = info.mensagem || info.modeloNome;
    }

    if (containerProgresso && barraProgresso) {
      if (info.status === 'carregando' && info.progresso !== null) {
        containerProgresso.style.display = 'block';
        barraProgresso.style.width = `${info.progresso}%`;
      } else {
        containerProgresso.style.display = 'none';
      }
    }
  }

  apresentarBoasVindas() {
    if (!this.chatbotUI) return;
    const msg = `Olá! Bem-vindo ao **Sabor Caseiro**! 🍲
Sou seu assistente virtual e estou aqui para ajudar você a montar sua marmita quentinha, escolher bebidas e receber seu pedido no conforto da sua casa ou trabalho.

Hoje é **${this.cardapioService.getNomeDiaAtual()}**! Gostaria de conhecer o cardápio de hoje?`;
    this.chatbotUI.adicionarMensagem(msg, 'bot');
  }

  salvarEstadoLocal() {
    Storage.salvar(Storage.chaves.CARRINHO, this.carrinhoService.exportarEstado());
    Storage.salvar(Storage.chaves.ENTREGA, this.entregaService.getEstado());
    Storage.salvar(Storage.chaves.HISTORICO, this.agentService.getHistorico());
  }

  restaurarEstadoLocal() {
    const dadosCarrinho = Storage.carregar(Storage.chaves.CARRINHO);
    if (dadosCarrinho) this.carrinhoService.importarEstado(dadosCarrinho);

    const dadosEntrega = Storage.carregar(Storage.chaves.ENTREGA);
    if (dadosEntrega) this.entregaService.setEstado(dadosEntrega);

    const dadosHist = Storage.carregar(Storage.chaves.HISTORICO);
    if (dadosHist) this.agentService.setHistorico(dadosHist);
  }
}

// Inicialização ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.inicializar();
  window.appSaborCaseiro = app; // Para inspeção no console e testes
});
