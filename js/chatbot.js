/**
 * chatbot.js - Gerencia a interface de conversação
 * Controla renderização das mensagens, sugestões rápidas, scroll automático e digitação.
 */

export class ChatbotUI {
  constructor({ containerChat, formInput, campoTexto, botaoEnviar, digitandoIndicador, onEnviarMensagem }) {
    this.containerChat = containerChat;
    this.formInput = formInput;
    this.campoTexto = campoTexto;
    this.botaoEnviar = botaoEnviar;
    this.digitandoIndicador = digitandoIndicador;
    this.onEnviarMensagem = onEnviarMensagem;

    this.vincularEventos();
  }

  vincularEventos() {
    if (this.formInput) {
      this.formInput.addEventListener('submit', (e) => {
        e.preventDefault();
        this.tratarEnvio();
      });
    }

    if (this.campoTexto) {
      this.campoTexto.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.tratarEnvio();
        }
      });
    }
  }

  tratarEnvio() {
    const texto = (this.campoTexto.value || '').trim();
    if (!texto) return;

    this.campoTexto.value = '';
    this.adicionarMensagem(texto, 'usuario');

    if (typeof this.onEnviarMensagem === 'function') {
      this.onEnviarMensagem(texto);
    }
  }

  /**
   * Adiciona uma mensagem ao chat
   */
  adicionarMensagem(texto, remetente = 'bot', meta = {}) {
    const msgEl = document.createElement('div');
    msgEl.className = `mensagem mensagem-${remetente}`;

    const bolhaEl = document.createElement('div');
    bolhaEl.className = 'mensagem-bolha';

    // Formatação básica de negrito e quebras de linha
    const formatado = this.formatarTexto(texto);
    bolhaEl.innerHTML = formatado;

    const horaEl = document.createElement('span');
    horaEl.className = 'mensagem-hora';
    const now = new Date();
    horaEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    msgEl.appendChild(bolhaEl);
    msgEl.appendChild(horaEl);

    this.containerChat.appendChild(msgEl);
    this.rolarParaFinal();
  }

  formatarTexto(txt) {
    if (!txt) return '';
    return txt
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  mostrarDigitando(visivel = true) {
    if (!this.digitandoIndicador) return;
    this.digitandoIndicador.style.display = visivel ? 'flex' : 'none';
    if (visivel) this.rolarParaFinal();
  }

  rolarParaFinal() {
    if (!this.containerChat) return;
    this.containerChat.scrollTop = this.containerChat.scrollHeight;
  }

  limpar() {
    if (this.containerChat) {
      this.containerChat.innerHTML = '';
    }
  }

  enviarTextoDireto(texto) {
    if (this.campoTexto) {
      this.campoTexto.value = texto;
      this.tratarEnvio();
    }
  }
}
