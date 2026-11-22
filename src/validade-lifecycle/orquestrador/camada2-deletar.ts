// src/validade-lifecycle/orquestrador/camada2-deletar.ts
// CAMADA 2 - DELETAR
// Só decide se pode deletar. Não deleta, não busca no banco.
// Regras congeladas:
// - encerrado NUNCA pode ser deletado, é histórico congelado
// - vencido NUNCA pode ser deletado, é histórico
// - Só espera e alerta podem ser deletados
// - vencido é sempre calculado, nunca confiado no banco

import { calcularStatusValidade } from '../calculo/calculo.js';
import type {
  DecisaoLifecycle,
  StatusValidade,
} from '../../types/lifecycle.type.js';

export function podeDeletar(
  statusSalvo: StatusValidade,
  atual: { data_iso: string; dias_antecedencia: number }
): DecisaoLifecycle {
  // 1. FONTE ÚNICA DE VERDADE: recalcula o status real
  const statusRealAtual = calcularStatusValidade(
    atual.data_iso,
    atual.dias_antecedencia
  );

  // 2. Encerrado é o único que congela pelo banco
  if (statusSalvo === 'encerrado') {
    return {
      autorizado: false,
      motivo: 'Não é possível excluir validade encerrada. Registro mantido para histórico e auditoria.',
      codigo: 'JA_ENCERRADO',
    };
  }

  // 3. Vencido real bloqueia, mesmo se o banco diz espera
  if (statusRealAtual === 'vencido') {
    return {
      autorizado: false,
      motivo: 'Não é possível excluir validade vencida. Registro mantido para histórico e auditoria.',
      codigo: 'JA_VENCIDO',
    };
  }

  // 4. Só espera e alerta chegam aqui
  if (statusRealAtual !== 'espera' && statusRealAtual !== 'alerta') {
    return {
      autorizado: false,
      motivo: 'Status atual não permite exclusão.',
      codigo: 'TRANSICAO_PROIBIDA',
    };
  }

  // 5. Autorizado
  return {
    autorizado: true,
    proximoStatus: statusRealAtual,
    statusCalculado: statusRealAtual,
  };
}