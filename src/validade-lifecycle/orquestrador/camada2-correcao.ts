// src/validade-lifecycle/orquestrador/camada2-correcao.ts
// CAMADA 2 - CORREÇÃO
// Só decide se pode corrigir. Não salva, não busca no banco.
// Regras congeladas:
// - Só pode corrigir se status for espera ou alerta
// - vencido e encerrado NUNCA podem ser corrigidos
// - Só pode corrigir data_iso e dias_antecedencia
// - Correção NUNCA pode deixar o registro vencido

import { calcularStatusValidade, isStatusValidoParaCorrecao } from '../calculo/calculo.js';
import { calcularDiasRestantes } from '../tempo/tempo.js';
import type {
  DecisaoLifecycle,
  EntradaCorrecao,
  StatusValidade,
} from '../../types/lifecycle.type.js';

/**
 * Decide se uma correção é permitida.
 * 
 * @param statusSalvo - Status atual no banco
 * @param atual - Dados atuais do registro (para usar como fallback)
 * @param correcao - O que o operador quer mudar
 */
export function podeCorrigir(
  statusSalvo: StatusValidade,
  atual: { data_iso: string; dias_antecedencia: number },
  correcao: EntradaCorrecao
): DecisaoLifecycle {
  // 1. FONTE ÚNICA DE VERDADE: recalcula o status real do registro atual
  // Não confia no que está no banco, porque o cron pode não ter rodado ainda
  const statusRealAtual = calcularStatusValidade(
    atual.data_iso,
    atual.dias_antecedencia
  );

  // 2. Se o status REAL já é terminal, bloqueia, mesmo se o banco dizia 'espera'
  if (statusSalvo === 'encerrado') {
    return {
      autorizado: false,
      motivo: 'Registro encerrado não pode ser corrigido. Crie um novo registro se precisar.',
      codigo: 'JA_ENCERRADO',
    };
  }

  if (statusRealAtual === 'vencido') {
    return {
      autorizado: false,
      motivo: 'Registro já está vencido e virou histórico. Não pode ser corrigido, mesmo que o banco ainda mostre espera.',
      codigo: 'JA_VENCIDO',
    };
  }

  // 3. Só espera e alerta chegam aqui, mas deixa explícito
  if (statusRealAtual !== 'espera' && statusRealAtual !== 'alerta') {
    return {
      autorizado: false,
      motivo: 'Status atual não permite correção.',
      codigo: 'TRANSICAO_PROIBIDA',
    };
  }

  // 4. Se não veio nada para corrigir, não tem o que fazer
  const temDataNova = correcao.data_iso !== undefined;
  const temAlertaNovo = correcao.dias_antecedencia !== undefined;

  if (!temDataNova && !temAlertaNovo) {
    return {
      autorizado: false,
      motivo: 'Nenhum campo para corrigir. Envie data_iso ou dias_antecedencia.',
      codigo: 'CAMPO_NAO_EDITAVEL',
    };
  }

  // 5. Resolve os valores finais (novo se veio, atual se não veio)
  const dataFinal = temDataNova ? correcao.data_iso! : atual.data_iso;
  const alertaFinal = temAlertaNovo ? correcao.dias_antecedencia! : atual.dias_antecedencia;

  // 6. Valida dias_antecedencia final
  if (
    typeof alertaFinal !== 'number' ||
    !Number.isInteger(alertaFinal) ||
    alertaFinal <= 0
  ) {
    return {
      autorizado: false,
      motivo: 'O período de alerta deve ser um número inteiro maior que zero. Ex: 1, 3, 7.',
      codigo: 'ERRO_DE_DIAS',
    };
  }

  // 7. Se mudou a data, a nova data não pode ser hoje nem passada
  if (temDataNova) {
    if (!dataFinal) {
      return {
        autorizado: false,
        motivo: 'Data de validade é obrigatória.',
        codigo: 'DATA_PASSADA',
      };
    }
    let diasRestantes: number;
        
    try {
      diasRestantes = calcularDiasRestantes(dataFinal);
    } catch {
      return {
        autorizado: false,
        motivo: `Data ${dataFinal} é inválida.`,
        codigo: 'DATA_PASSADA',
      };
    }

    if (Number.isNaN(diasRestantes)) {
      return {
        autorizado: false,
        motivo: `Data ${dataFinal} é inválida.`,
        codigo: 'DATA_PASSADA',
      };
    }

    if (diasRestantes === 0) {
      return {
        autorizado: false,
        motivo: 'Não é possível corrigir para a data de hoje. A data de hoje já conta como vencida.',
        codigo: 'DATA_IGUAL_HOJE',
      };
    }

    if (diasRestantes < 0) {
      return {
        autorizado: false,
        motivo: 'Não é possível corrigir para uma data no passado.',
        codigo: 'DATA_PASSADA',
      };
    }
  }

  // 8. Calcula o status que ficaria após a correção
  const statusCalculado = calcularStatusValidade(dataFinal, alertaFinal);

  // 9. Correção nunca pode deixar vencido
  if (!isStatusValidoParaCorrecao(statusCalculado)) {
    return {
      autorizado: false,
      motivo: `Correção para data ${dataFinal} com alerta de ${alertaFinal} dias deixaria o registro vencido. Aumente a data ou reduza os dias de alerta.`,
      codigo: 'FICARIA_VENCIDO',
    };
  }

  // 10. Autorizado. O próximo status é o calculado (espera ou alerta)
  // A Camada 3 vai aplicar a transição espera -> alerta ou alerta -> espera
  // se precisar, mas a decisão já vem aqui.
  return {
    autorizado: true,
    proximoStatus: statusCalculado,
    statusCalculado,
  };
}