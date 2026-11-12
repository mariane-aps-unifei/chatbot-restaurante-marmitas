/**
 * cardapio.js - Módulo de gestão do cardápio diário
 * Responsável por carregar os produtos, filtrar pelo dia da semana e fornecer consultas seguras.
 */

export class CardapioService {
  constructor() {
    this.dados = null;
    this.diaSimulado = null; // Permite simular dias para testes acadêmicos
  }

  /**
   * Inicializa carregando os dados do JSON ou de fallback embutido
   */
  async inicializar(caminhoJson = 'data/cardapio.json') {
    try {
      const resp = await fetch(caminhoJson);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.dados = await resp.json();
    } catch (e) {
      console.warn('[CardapioService] Falha ao carregar cardapio.json via fetch, usando fallback interno:', e);
      this.dados = this.getFallbackData();
    }
    return this.dados;
  }

  /**
   * Permite injetar dados diretamente (útil para testes unitários)
   */
  setDados(dados) {
    this.dados = dados;
  }

  /**
   * Permite alterar o dia da semana para testes (0 = Domingo, 1 = Segunda, ... 6 = Sábado)
   */
  setDiaSimulado(dia) {
    this.diaSimulado = dia;
  }

  /**
   * Retorna o dia da semana atual (0 a 6)
   */
  getDiaAtual() {
    if (this.diaSimulado !== null && this.diaSimulado !== undefined) {
      return this.diaSimulado;
    }
    return new Date().getDay();
  }

  /**
   * Nome legível do dia atual
   */
  getNomeDiaAtual() {
    const dia = this.getDiaAtual();
    const nomes = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    return nomes[dia] || "Desconhecido";
  }

  /**
   * Verifica se o restaurante está aberto no dia atual
   */
  isAbertoHoje() {
    if (!this.dados || !this.dados.funcionamento) return true;
    const dia = this.getDiaAtual();
    return this.dados.funcionamento.diasAbertos.includes(dia);
  }

  /**
   * Retorna os produtos cadastrados
   */
  getTodosProdutos() {
    return this.dados ? this.dados.produtos : [];
  }

  /**
   * Retorna apenas os produtos disponíveis no dia da semana atual
   */
  getCardapioDoDia() {
    const dia = this.getDiaAtual();
    const todos = this.getTodosProdutos();
    return todos.filter(p => p.ativo && p.diasDisponiveis && p.diasDisponiveis.includes(dia));
  }

  /**
   * Busca um produto por ID
   */
  getProdutoPorId(id) {
    if (!id || !this.dados) return null;
    const norm = String(id).toLowerCase().trim();
    return this.dados.produtos.find(p => p.id.toLowerCase() === norm) || null;
  }

  /**
   * Busca um produto por termo aproximado ou nome
   */
  buscarProdutoPorTermo(termo) {
    if (!termo || !this.dados) return null;
    const t = this.normalizarTexto(termo);

    // Mapeamentos comuns em linguagem natural
    const aliases = {
      "bife": "marmita_bife",
      "bife acebolado": "marmita_bife",
      "carne": "marmita_bife",
      "frango": "marmita_frango",
      "frango grelhado": "marmita_frango",
      "carne de panela": "marmita_carne_panela",
      "carne cozida": "marmita_carne_panela",
      "peixe": "marmita_peixe",
      "peixe grelhado": "marmita_peixe",
      "tilapia": "marmita_peixe",
      "vegetariana": "marmita_vegetariana",
      "legumes": "marmita_vegetariana",
      "grao de bico": "marmita_vegetariana",
      "feijoada": "marmita_feijoada",
      "refrigerante": "refri_lata",
      "refri": "refri_lata",
      "coca": "refri_lata",
      "coca cola": "refri_lata",
      "guarana": "refri_lata",
      "fanta": "refri_lata",
      "suco": "suco_natural",
      "suco natural": "suco_natural",
      "agua": "agua_mineral",
      "agua mineral": "agua_mineral",
      "pudim": "pudim",
      "sobremesa": "pudim"
    };

    if (aliases[t]) {
      const p = this.getProdutoPorId(aliases[t]);
      if (p) return p;
    }

    // Busca exata ou por inclusão no nome
    return this.dados.produtos.find(p => {
      const nomeNorm = this.normalizarTexto(p.nome);
      return nomeNorm.includes(t) || t.includes(nomeNorm);
    }) || null;
  }

  /**
   * Verifica se o produto está disponível no dia atual
   */
  isDisponivelHoje(id) {
    const p = this.getProdutoPorId(id);
    if (!p || !p.ativo) return false;
    const dia = this.getDiaAtual();
    return p.diasDisponiveis.includes(dia);
  }

  /**
   * Formata preço em centavos para moeda BRL (ex: 2500 -> "R$ 25,00")
   */
  static formatarPreco(centavos) {
    if (typeof centavos !== 'number') return 'R$ 0,00';
    const valor = centavos / 100;
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  normalizarTexto(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  getFallbackData() {
    return {
      diasSemana: { "0": "Domingo", "1": "Segunda-feira", "2": "Terça-feira", "3": "Quarta-feira", "4": "Quinta-feira", "5": "Sexta-feira", "6": "Sábado" },
      funcionamento: { diasAbertos: [1, 2, 3, 4, 5, 6], fechadoTexto: "Aos domingos o restaurante não abre para atendimento." },
      produtos: [
        { id: "marmita_bife", nome: "Marmita de Bife Acebolado", descricao: "Arroz, feijão, bife acebolado, farofa e salada.", categoria: "marmitas", precoCentavos: 2500, diasDisponiveis: [1,2,3,4,5,6], ingredientes: ["arroz","feijão","bife bovino","cebola","alho","farofa","salada","pimenta"], opcoesPersonalizacao: { permitePonto: true, pontosPermitidos: ["malpassado","ao ponto","bem passado"], removiveis: ["cebola","alho","pimenta","farofa","salada","feijão"] }, ativo: true },
        { id: "marmita_frango", nome: "Marmita de Frango Grelhado", descricao: "Arroz, feijão, filé de frango com ervas e legumes.", categoria: "marmitas", precoCentavos: 2200, diasDisponiveis: [1,2,3,4,5,6], ingredientes: ["arroz","feijão","frango","legumes","alho","ervas finas"], opcoesPersonalizacao: { permitePonto: false, pontosPermitidos: [], removiveis: ["alho","feijão","legumes","ervas finas"] }, ativo: true },
        { id: "marmita_carne_panela", nome: "Marmita de Carne de Panela", descricao: "Arroz, feijão preto, carne bovina cozida com batata e cenoura.", categoria: "marmitas", precoCentavos: 2700, diasDisponiveis: [2,4,6], ingredientes: ["arroz","feijão preto","carne de panela","batata","cenoura","cebola","alho"], opcoesPersonalizacao: { permitePonto: false, pontosPermitidos: [], removiveis: ["cebola","alho","batata","cenoura"] }, ativo: true },
        { id: "marmita_peixe", nome: "Marmita de Peixe Grelhado", descricao: "Arroz, pirão e tilápia grelhada ao molho de limão.", categoria: "marmitas", precoCentavos: 2900, diasDisponiveis: [3,5], ingredientes: ["arroz","pirão","tilápia","limão","alho","ervas"], opcoesPersonalizacao: { permitePonto: false, pontosPermitidos: [], removiveis: ["alho","pirão","limão"] }, ativo: true },
        { id: "marmita_vegetariana", nome: "Marmita Vegetariana", descricao: "Arroz integral, feijão, legumes assados e hambúrguer de grão-de-bico.", categoria: "marmitas", precoCentavos: 2300, diasDisponiveis: [1,2,3,4,5,6], ingredientes: ["arroz integral","feijão","hambúrguer de grão-de-bico","legumes assados"], opcoesPersonalizacao: { permitePonto: false, pontosPermitidos: [], removiveis: ["cebola","alho","feijão"] }, ativo: true },
        { id: "marmita_feijoada", nome: "Marmita de Feijoada Completa", descricao: "Arroz, feijoada tradicional, couve refogada, farofa e laranja.", categoria: "marmitas", precoCentavos: 3000, diasDisponiveis: [3,6], ingredientes: ["arroz","feijão preto","carnes de porco","couve","farofa","laranja"], opcoesPersonalizacao: { permitePonto: false, pontosPermitidos: [], removiveis: ["alho","couve","farofa","laranja"] }, ativo: true },
        { id: "refri_lata", nome: "Refrigerante Lata 350ml", descricao: "Coca-Cola, Guaraná ou Fanta Laranja.", categoria: "bebidas", precoCentavos: 500, diasDisponiveis: [1,2,3,4,5,6], ingredientes: ["refrigerante"], opcoesPersonalizacao: { permitePonto: false, pontosPermitidos: [], removiveis: [], sabores: ["Coca-Cola","Guaraná","Fanta"] }, ativo: true },
        { id: "suco_natural", nome: "Suco Natural 500ml", descricao: "Laranja, Maracujá ou Abacaxi com Hortelã.", categoria: "bebidas", precoCentavos: 700, diasDisponiveis: [1,2,3,4,5,6], ingredientes: ["fruta natural","água","açúcar"], opcoesPersonalizacao: { permitePonto: false, pontosPermitidos: [], removiveis: ["açúcar"] }, ativo: true },
        { id: "agua_mineral", nome: "Água Mineral 500ml", descricao: "Com ou sem gás.", categoria: "bebidas", precoCentavos: 300, diasDisponiveis: [1,2,3,4,5,6], ingredientes: ["água mineral"], opcoesPersonalizacao: { permitePonto: false, pontosPermitidos: [], removiveis: [] }, ativo: true },
        { id: "pudim", nome: "Pudim de Leite Condensado", descricao: "Fatia tradicional com calda de caramelo.", categoria: "sobremesas", precoCentavos: 800, diasDisponiveis: [1,2,3,4,5,6], ingredientes: ["leite condensado","ovos"], opcoesPersonalizacao: { permitePonto: false, pontosPermitidos: [], removiveis: [] }, ativo: true }
      ]
    };
  }
}
