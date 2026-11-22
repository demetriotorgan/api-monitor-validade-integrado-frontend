// src/validade-lifecycle/orquestrador/camada2-encerramento.ts
// CAMADA 2 - ENCERRAMENTO
// Só o humano pode encerrar. O cron NUNCA encerra.
// Regra congelada: encerrado é terminal, nunca volta (sucesso).
// Regra congelada: vencido é perda, nunca vira encerrado 

import { calcularStatusValidade } from '../calculo/calculo.js';
import type {
  DecisaoLifecycle,
  StatusValidade,
} from '../../types/lifecycle.type.js';

/**
 * Decide se um registro pode ser encerrado.
 *
 * Regras:
 * - espera real -> pode encerrar
 * - alerta real -> pode encerrar
 * - encerrado (banco) -> NÃO pode encerrar de novo
 * - vencido (banco OU cálculo) -> NÃO pode encerrar, é perda
 */
export function podeEncerrar(
  statusSalvo: StatusValidade,
  atual: { data_iso: string; dias_antecedencia: number }
): DecisaoLifecycle {
  // 1. FONTE ÚNICA DE VERDADE: recalcula o status real agora
  const statusRealAtual = calcularStatusValidade(
    atual.data_iso,
    atual.dias_antecedencia
  );

  // 2. ENCERRADO já é terminal de sucesso, não encerra de novo
  // Só o banco sabe, cálculo nunca retorna 'encerrado'
  if (statusSalvo === 'encerrado') {
    return {
      autorizado: false,
      motivo: 'Registro já está encerrado.',
      codigo: 'JA_ENCERRADO',
    };
  }

  // 3. VENCIDO é PERDA, virou histórico, congela, ninguém muda
  // Bloqueia se o BANCO diz vencido OU se o CÁLCULO diz vencido
  // Conservador de propósito: nunca transformar perda em sucesso
  if (statusSalvo === 'vencido' || statusRealAtual === 'vencido') {
    return {
      autorizado: false,
      motivo: 'Registro vencido é perda e virou histórico. Não pode ser encerrado.',
      codigo: 'JA_VENCIDO',
    };
  }

  // 4. Só espera e alerta real podem encerrar = produto salvo antes de vencer
  if (statusRealAtual !== 'espera' && statusRealAtual !== 'alerta') {
    return {
      autorizado: false,
      motivo: 'Status atual não permite encerramento.',
      codigo: 'TRANSICAO_PROIBIDA',
    };
  }

  // 5. Autorizado: vira encerrado
  return {
    autorizado: true,
    proximoStatus: 'encerrado',
    statusCalculado: 'encerrado',
  };
}