/**
 * entrega.js - Módulo de cálculo e gestão de taxa de entrega
 * Gerencia regiões cadastradas, retirada e validações de endereço.
 */

export class EntregaService {
  constructor() {
    this.dados = null;
    this.estadoAtual = {
      tipo: null, // 'entrega' | 'retirada' | null
      clienteNome: '',
      regiaoId: null,
      regiaoNome: '',
      endereco: '',
      numero: '',
      complemento: '',
      taxaCentavos: 0,
      definido: false
    };
  }

  async inicializar(caminhoJson = 'data/entregas.json') {
    try {
      const resp = await fetch(caminhoJson);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.dados = await resp.json();
    } catch (e) {
      console.warn('[EntregaService] Falha ao carregar entregas.json via fetch, usando fallback:', e);
      this.dados = this.getFallbackData();
    }
    return this.dados;
  }

  setDados(dados) {
    this.dados = dados;
  }

  getRegioes() {
    return this.dados ? this.dados.regioes : [];
  }

  getFormasPagamento() {
    return this.dados ? this.dados.formasPagamento : [];
  }

  buscarRegiao(nomeOuTermo) {
    if (!nomeOuTermo || !this.dados) return null;
    const norm = this.normalizar(nomeOuTermo);

    // Retirada direta
    if (norm.includes('retirada') || norm.includes('buscar') || norm.includes('balcao') || norm.includes('restaurante')) {
      return { id: 'retirada', nome: 'Retirada no Restaurante', taxaCentavos: 0 };
    }

    for (const reg of this.dados.regioes) {
      if (this.normalizar(reg.id) === norm || this.normalizar(reg.nome) === norm) {
        return reg;
      }
      if (reg.sinonimos) {
        for (const sin of reg.sinonimos) {
          if (this.normalizar(sin) === norm || norm.includes(this.normalizar(sin))) {
            return reg;
          }
        }
      }
      if (norm.includes(this.normalizar(reg.nome))) {
        return reg;
      }
    }
    return null;
  }

  definirRetirada(clienteNome = '') {
    this.estadoAtual = {
      tipo: 'retirada',
      clienteNome: clienteNome || this.estadoAtual.clienteNome || 'Cliente',
      regiaoId: 'retirada',
      regiaoNome: 'Retirada no Restaurante',
      endereco: 'Balcão do Restaurante',
      numero: 'S/N',
      complemento: '',
      taxaCentavos: 0,
      definido: true
    };
    return { ...this.estadoAtual };
  }

  definirEntrega({ regiao, endereco, numero, complemento, clienteNome }) {
    const regObj = this.buscarRegiao(regiao);
    if (!regObj) {
      return {
        sucesso: false,
        mensagem: `A região informada "${regiao}" não é atendida pelo restaurante. As regiões atendidas são: ${this.getRegioes().map(r => r.nome).join(', ')} ou Retirada no Restaurante.`
      };
    }

    if (regObj.id === 'retirada') {
      const ret = this.definirRetirada(clienteNome);
      return { sucesso: true, dados: ret, mensagem: 'Opção de retirada no restaurante definida (Taxa: R$ 0,00).' };
    }

    this.estadoAtual = {
      tipo: 'entrega',
      clienteNome: clienteNome || this.estadoAtual.clienteNome,
      regiaoId: regObj.id,
      regiaoNome: regObj.nome,
      endereco: endereco || this.estadoAtual.endereco,
      numero: numero || this.estadoAtual.numero,
      complemento: complemento || this.estadoAtual.complemento,
      taxaCentavos: regObj.taxaCentavos,
      definido: true
    };

    return {
      sucesso: true,
      dados: { ...this.estadoAtual },
      mensagem: `Entrega definida para ${regObj.nome}. Taxa: ${this.formatarPreco(regObj.taxaCentavos)}.`
    };
  }

  getEstado() {
    return { ...this.estadoAtual };
  }

  setEstado(estado) {
    if (estado) {
      this.estadoAtual = { ...this.estadoAtual, ...estado };
    }
  }

  limpar() {
    this.estadoAtual = {
      tipo: null,
      clienteNome: '',
      regiaoId: null,
      regiaoNome: '',
      endereco: '',
      numero: '',
      complemento: '',
      taxaCentavos: 0,
      definido: false
    };
  }

  formatarPreco(centavos) {
    const v = (centavos || 0) / 100;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  normalizar(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  getFallbackData() {
    return {
      restaurante: { nome: "Sabor Caseiro", endereco: "Rua das Marmitas, 100 - Centro", tempoMedioMinutos: 40 },
      regioes: [
        { id: "centro", nome: "Centro", taxaCentavos: 500 },
        { id: "bairro_a", nome: "Bairro A", sinonimos: ["bairro a", "bairroa", "zona norte"], taxaCentavos: 700 },
        { id: "bairro_b", nome: "Bairro B", sinonimos: ["bairro b", "bairrob", "zona sul"], taxaCentavos: 1000 },
        { id: "bairro_c", nome: "Bairro C", sinonimos: ["bairro c", "bairroc"], taxaCentavos: 1200 }
      ],
      formasPagamento: [
        { id: "pix", nome: "Pix" },
        { id: "cartao_credito", nome: "Cartão de Crédito" },
        { id: "cartao_debito", nome: "Cartão de Débito" },
        { id: "dinheiro", nome: "Dinheiro" }
      ]
    };
  }
}
