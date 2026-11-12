/**
 * storage.js - Camada de persistência local (localStorage)
 * Permite salvar e restaurar o estado do carrinho, histórico da conversa e preferências.
 */

const STORAGE_KEYS = {
  CARRINHO: 'saborcaseiro_carrinho',
  ENTREGA: 'saborcaseiro_entrega',
  HISTORICO: 'saborcaseiro_historico',
  CONFIG_LLM: 'saborcaseiro_config_llm'
};

export const Storage = {
  /**
   * Salva dados serializados em JSON no localStorage
   */
  salvar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      console.warn(`[Storage] Erro ao salvar chave ${chave}:`, e);
      return false;
    }
  },

  /**
   * Recupera dados do localStorage já desserializados
   */
  carregar(chave, valorPadrao = null) {
    try {
      const item = localStorage.getItem(chave);
      if (item === null) return valorPadrao;
      return JSON.parse(item);
    } catch (e) {
      console.warn(`[Storage] Erro ao carregar chave ${chave}:`, e);
      return valorPadrao;
    }
  },

  /**
   * Remove uma chave específica
   */
  remover(chave) {
    try {
      localStorage.removeItem(chave);
      return true;
    } catch (e) {
      console.warn(`[Storage] Erro ao remover chave ${chave}:`, e);
      return false;
    }
  },

  /**
   * Limpa todos os dados da aplicação
   */
  limparTudo() {
    Object.values(STORAGE_KEYS).forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });
  },

  chaves: STORAGE_KEYS
};
