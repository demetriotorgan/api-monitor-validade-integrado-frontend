// src/validade-lifecycle/orquestrador/camada3-transicao.ts
// CAMADA 3 - TRANSIÇÃO POR TEMPO (CRON)
// Só o tempo pode mover aqui. Nenhum humano chama essa camada.
// Regras congeladas:
// - encerrado é terminal, cron NUNCA mexe em encerrado
// - cron NUNCA encerra, só move espera -> alerta -> vencido
// - cron NUNCA volta: vencido nunca volta para alerta, alerta nunca volta para espera

import { calcularStatusValidade } from '../calculo/calculo.js'; 
import type {
  DecisaoLifecycle,
  ContextoTransicao,
} from '../../types/lifecycle.type.js';

/**
 * Decide se o cron deve mover um registro.
 * 
 * @param contexto - Status salvo + data + alerta + hoje (hoje vem da Camada 4, via quem chama)
 */
export function podeTransicionarPorTempo(
  contexto: ContextoTransicao
): DecisaoLifecycle {
  // 1. Encerrado é terminal. Cron nunca toca.
  if (contexto.statusSalvo === 'encerrado') {
    return {
      autorizado: false,
      motivo: 'Registro encerrado é terminal. Cron não move.',
      codigo: 'STATUS_TERMINAL',
    };
  }

  // 2. Calcula qual deveria ser o status hoje
  const statusCalculado = calcularStatusValidade(
    contexto.data_iso,
    contexto.dias_antecedencia
  );

  // 3. Se já está no status certo, não faz nada
  // Isso deixa o cron idempotente: rodar 2x não muda nada na 2ª vez
  if (statusCalculado === contexto.statusSalvo) {
    return {
      autorizado: false,
      motivo: `Já está em ${contexto.statusSalvo}. Nenhuma transição necessária.`,
      codigo: 'TRANSICAO_PROIBIDA',
    };
  }

  // 4. Transições permitidas, só para frente:
  // espera -> alerta
  // espera -> vencido (pulou o alerta, ex: cron ficou 2 dias sem rodar)
  // alerta -> vencido
  const transicaoPermitida =
    (contexto.statusSalvo === 'espera' && statusCalculado === 'alerta') ||
    (contexto.statusSalvo === 'espera' && statusCalculado === 'vencido') ||
    (contexto.statusSalvo === 'alerta' && statusCalculado === 'vencido');

  if (!transicaoPermitida) {
    // Aqui cai qualquer volta: vencido -> alerta, vencido -> espera, alerta -> espera
    // Isso NUNCA deveria acontecer se o cálculo estiver certo,
    // mas se acontecer, a gente barra em vez de deixar voltar.
    return {
      autorizado: false,
      motivo: `Transição ${contexto.statusSalvo} -> ${statusCalculado} não é permitida. Cron só anda para frente.`,
      codigo: 'TRANSICAO_PROIBIDA',
    };
  }

  // 5. Autorizado. Cron pode mover.
  return {
    autorizado: true,
    proximoStatus: statusCalculado,
    statusCalculado,
  };
}