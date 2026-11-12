# Arquitetura do Sistema - Sabor Caseiro

Este documento descreve detalhadamente a arquitetura de software, fluxo de processamento e decisões técnicas do **Chatbot de Vendas para Restaurante de Marmitas utilizando Agente LLM**, desenvolvido integralmente no modelo *client-side*.

---

## 1. Visão Geral da Arquitetura

A aplicação opera 100% no navegador do usuário, eliminando a dependência de servidores de aplicação (Node.js, Python, Flask, etc.) ou bancos de dados tradicionais.

```mermaid
graph TD
    User([Usuário / Cliente]) <--> UI[Interface Web HTML5 / CSS3 / ChatbotUI]
    UI <--> App[Orquestrador Central - app.js]
    App <--> Agent[Agente Inteligente - agent.js]
    
    subgraph "Camada de Inteligência e Inferência"
        Agent <--> Prompts[Prompts e Contexto - prompts.js]
        Agent <--> LLM[Motor LLM - llm.js]
        LLM -.-> WebLLM[WebLLM Llama-3.2 Local via WebGPU]
        LLM -.-> ExternalAPI[APIs Externas CORS Gemini/Groq/OpenAI]
        LLM -.-> NLU[Engine NLU Local Puro Client-Side]
    end

    subgraph "Camada de Segurança e Execução"
        Agent <--> Guardrails[Guardrails & Validação - guardrails.js]
        Guardrails --> Tools[Ferramentas Estruturadas - tools.js]
    end

    subgraph "Regras de Negócio e Domínio"
        Tools --> Cardapio[Gestão do Cardápio - cardapio.js]
        Tools --> Carrinho[Cálculos Financeiros e Itens - carrinho.js]
        Tools --> Entrega[Cálculo de Entrega - entrega.js]
        Carrinho --> Storage[Persistência Local - storage.js]
    end

    Cardapio -.-> DataCardapio[(data/cardapio.json)]
    Entrega -.-> DataEntrega[(data/entregas.json)]
    Storage -.-> LocalStorage[(Navegador localStorage)]
```

---

## 2. Princípios de Projeto

1. **Separação Estrita de Responsabilidades:**
   - A **LLM** interpreta a intenção em linguagem natural e propõe ações estruturadas (JSON).
   - O **JavaScript** é o único responsável pelos cálculos monetários, validação de regras de negócio, tabelas de frete e atualização de estado.
2. **Segurança por Design (Guardrails):**
   - Nenhuma ação proposta pela LLM é executada diretamente.
   - Não se utiliza `eval()` ou interpretadores de código em tempo de execução.
   - Todas as requisições passam por verificação contra *Prompt Injection*, verificação de estoque/cardápio do dia e integridade de tipos e valores.
3. **Precisão Financeira:**
   - Todos os valores são processados internamente em centavos (números inteiros), evitando desvios de arredondamento de ponto flutuante em JavaScript (`0.1 + 0.2`).
4. **Execução Client-Side Autônoma:**
   - Suporte nativo à execução de modelo LLM local (*WebLLM* via WebGPU), com opção de chaves de API informadas pelo próprio usuário em tempo de execução e engine NLU local para compatibilidade universal.

---

## 3. Fluxo de Execução do Agente

O ciclo de atendimento segue um fluxo de 10 etapas bem definidas:

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Usuário
    participant UI as ChatbotUI
    participant Agent as AgentService
    participant Guard as GuardrailsService
    participant LLM as LLMService
    participant Tools as AgentTools
    participant Carrinho as CarrinhoService

    Cliente->>UI: Digita mensagem de texto
    UI->>Agent: processarMensagem(texto)
    Agent->>Guard: inspecionarMensagemUsuario(texto)
    Note over Guard: Verifica tentativas de Jailbreak / Prompt Injection
    Guard-->>Agent: Mensagem higienizada (Seguro: true)
    Agent->>LLM: gerarResposta(historico, contextoDinamico, texto)
    LLM-->>Agent: Retorno JSON estruturado { action, parametros, mensagem }
    Agent->>Guard: validarAcaoLLM(acaoJSON)
    Note over Guard: Valida se a função é autorizada e se produto existe hoje
    Guard-->>Agent: Validação aprovada
    Agent->>Tools: executarFerramenta(action, parametros)
    Tools->>Carrinho: Executa operação real (ex: adicionarItem)
    Carrinho-->>Tools: Resultado fidedigno da operação
    Tools-->>Agent: Retorno estruturado da execução
    Agent->>UI: Formula resposta final baseada no resultado real
    UI->>Cliente: Exibe mensagem no chat e atualiza visão do carrinho
```

---

## 4. Estrutura dos Módulos

- **`js/app.js`**: Ponto de entrada, instancia e vincula os módulos, controla eventos do DOM.
- **`js/chatbot.js`**: Gerencia a renderização de balões de mensagens, rolagem automática e digitação.
- **`js/llm.js`**: Abstração do modelo de linguagem. Conecta ao WebLLM local, APIs externas ou processador NLU.
- **`js/prompts.js`**: System prompt em português com diretrizes estritas e gerador de contexto dinâmico do restaurante.
- **`js/agent.js`**: Orquestrador do fluxo do agente (NLU -> Validação -> Execução -> Resposta).
- **`js/tools.js`**: Implementação das funções autorizadas (`consultarCardapio`, `adicionarItem`, `personalizarItem`, etc.).
- **`js/guardrails.js`**: Barreira de proteção contra jailbreaks, preços manipulados e chamadas arbitrárias.
- **`js/cardapio.js`**: Filtra itens por dia da semana e fornece informações sobre ingredientes e adicionais.
- **`js/carrinho.js`**: Fonte da verdade do pedido, cálculo de subtotais e personalizações isoladas.
- **`js/entrega.js`**: Tabela de taxas de entrega e bairros atendidos.
- **`js/storage.js`**: Persistência via `localStorage`.
