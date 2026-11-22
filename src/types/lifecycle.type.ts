// src/validade-lifecycle/tipos/lifecycle.types.ts
// TIPOS DO CICLO DE VIDA
// Todas as camadas usam esses tipos para decidir.
// Nenhuma camada inventa um formato novo de resposta.

export type StatusValidade = 'espera' | 'alerta' | 'vencido' | 'encerrado';

export type OperacaoLifecycle =
  | 'criacao'
  | 'correcao'
  | 'encerramento'
  | 'transicao_tempo';

/**
 * Resultado padrão de toda decisão da Camada 1 e 2.
 * Ou é autorizado, ou é rejeitado com motivo.
 * Nunca lança throw para regra de negócio.
 * Throw só para erro técnico: data inválida, banco fora, etc.
 * 
 * Por que isso? Para o controller não precisar fazer try/catch
 * para saber se o operador pode ou não pode fazer algo.
 * Ele só verifica: autorizado === true ou false.
 */
export type DecisaoLifecycle =
  | {
      autorizado: true;
      // Quando autorizado, a Camada 3 sabe para qual status ir
      proximoStatus?: StatusValidade;
      // Para a Camada 2/3 saberem o que recalcular
      statusCalculado?: StatusValidade;
    }
  | {
      autorizado: false;
      // Motivo legível, para log e para o front mostrar
      motivo: string;
      // Código para o front decidir o que mostrar, sem depender de texto
      codigo:
        | 'JA_VENCIDO'
        | 'JA_ENCERRADO'
        | 'DATA_PASSADA'
        | 'DATA_IGUAL_HOJE'
        | 'FICARIA_VENCIDO'
        | 'DUPLICATA'
        | 'PRODUTO_INVALIDO'
        | 'TRANSICAO_PROIBIDA'
        | 'STATUS_TERMINAL'
        | 'CAMPO_NAO_EDITAVEL'
        | 'ERRO_DE_DIAS'
    };

/**
 * Entrada da Camada 1 - Criação
 * É exatamente o que o controller recebe do front,
 * sem o campo validade. Front nunca manda validade.
 */
export interface EntradaCriacao {
  produto: string;
  ml?: number | null;
  data_iso: string;
  dias_antecedencia: number;
}

/**
 * Entrada da Camada 2 - Correção
 * Só os campos que a gente congelou que podem ser corrigidos.
 * Se o front mandar produto ou ml aqui, a Camada 2 rejeita.
 */
export interface EntradaCorrecao {
  data_iso?: string;
  dias_antecedencia?: number;
}

/**
 * Entrada da Camada 2 - Encerramento
 * Não precisa de dado. Só precisa saber qual registro.
 * O registro em si já está no banco.
 */
export interface EntradaEncerramento {
  id: string;
}

/**
 * O que a Camada 3 recebe para decidir transição.
 * Ela nunca recebe o request inteiro do front.
 * Ela só recebe o que ela precisa: status atual + dados calculados.
 */
export interface ContextoTransicao {
  id: string;
  statusSalvo: StatusValidade;
  data_iso: string;
  dias_antecedencia: number;
  // Hoje vem da Camada 4, mas a gente passa como string para deixar explícito
  // que a Camada 3 não decide "hoje" sozinha.
  hoje_iso: string;
}