// src/validade-lifecycle/tempo/tempo.ts
// CAMADA 4 - TEMPO
// Única fonte de verdade para "hoje" no sistema.
// Regra congelada: new Date() só pode existir aqui.
// Todo o resto do sistema usa essas funções.

import { startOfDay, parseISO, differenceInCalendarDays, isValid } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TIMEZONE_BRASILIA = 'America/Sao_Paulo';

/**
 * Retorna o "hoje" oficial do sistema.
 * Sempre em Brasília, sempre com startOfDay (00:00).
 * É a única função que pode usar new Date().
 */
export function obterHojeBrasilia(): Date {
  const agora = new Date();
  const hojeEmBrasilia = toZonedTime(agora, TIMEZONE_BRASILIA);
  return startOfDay(hojeEmBrasilia);
}

/**
 * Normaliza qualquer data_iso que entra no sistema.
 * Garante que ela sempre seja meia-noite de Brasília.
 * Se a data for inválida, lança erro - a validação de formato
 * é feita aqui, para ninguém precisar repetir parseISO espalhado.
 */
export function normalizarDataValidade(data_iso: string): Date {
  const parsed = parseISO(data_iso);
  if (!isValid(parsed)) {
    throw new Error(`Data inválida: ${data_iso}`);
  }
  // startOfDay garante que 2026-11-21 é sempre 2026-11-21 00:00
  // Independente de como o front mandou.
  return startOfDay(parsed);
}

/**
 * Calcula quantos dias faltam para a data.
 * Sempre em dias corridos de calendário.
 * NUNCA usa horas / 24.
 * 
 * Exemplos:
 * hoje 21/11, validade 23/11 -> retorna 2
 * hoje 21/11, validade 21/11 -> retorna 0
 * hoje 21/11, validade 20/11 -> retorna -1
 */
export function calcularDiasRestantes(data_iso: string): number {
  const hoje = obterHojeBrasilia();
  const validade = normalizarDataValidade(data_iso);
  return differenceInCalendarDays(validade, hoje);
}

/**
 * Diz se a data já está vencida.
 * Regra congelada: data == hoje já é vencido.
 * O dia da validade conta como vencido para monitoramento.
 */
export function isDataVencida(data_iso: string): boolean {
  return calcularDiasRestantes(data_iso) <= 0;
}