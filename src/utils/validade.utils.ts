// utils/validade.utils.ts
import { parseISO, startOfDay, isBefore, isEqual, differenceInCalendarDays, subDays, isAfter } from 'date-fns';
import { IValidade, IValidadeComStatus, StatusValidade } from '../types/validade.types.js';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

/**
 * Calcula o status inicial de uma validade com base na data de vencimento
 * e nos dias de antecedência configurados no alerta.
 */

const TIMEZONE_BRASIL = 'America/Sao_Paulo';

// ÚNICA fonte de "hoje" - todo mundo usa essa
export function obterHojeBrasilia(): Date {
  const agoraUtc = new Date();
  const hojeBrasilia = toZonedTime(agoraUtc, TIMEZONE_BRASIL);
  return startOfDay(hojeBrasilia);
}

// RF-14: Usado só no controller, para dar a mensagem certa
// Retorna true se data > hoje
export function isDataValidadeFutura(dataIso: string): boolean {
  const hoje = obterHojeBrasilia();
  const dataValidade = startOfDay(parseISO(dataIso));
  return isAfter(dataValidade, hoje);
}

// RF-13 / RF-14: Só calcula, não lança erro
export function calcularStatusValidade(dataIso: string, diasAntecedencia: number): StatusValidade {
  const hoje = obterHojeBrasilia();
  const dataValidade = startOfDay(parseISO(dataIso));

  // Data <= hoje = vencido (hoje já conta como vencido para monitoramento)
  if (isBefore(dataValidade, hoje) || isEqual(dataValidade, hoje)) {
    return 'vencido';
  }

  const diasRestantes = differenceInCalendarDays(dataValidade, hoje);

  // RF-13: data - alerta <= hoje = alerta
  if (diasRestantes <= diasAntecedencia) {
    return 'alerta';
  }

  return 'espera';
};

// RF-19: data_inicio_alerta = data_validade - dias_alerta
export function calcularDataInicioAlerta(dataIso: string, diasAntecedencia: number): string {
  const dataValidade = startOfDay(parseISO(dataIso));
  const inicioAlerta = subDays(dataValidade, diasAntecedencia);
  // RF-19: Retorna no mesmo formato YYYY-MM-DD do data_iso, sem converter para UTC
  return format(inicioAlerta, 'yyyy-MM-dd');
}

function calcularDentroDoPeriodoAlerta(validade: IValidade): boolean {
  // RF-21: Encerrado é histórico congelado, nunca está em alerta
  if (validade.validade === 'encerrado') return false;

  const hoje = obterHojeBrasilia();
  const dataValidade = startOfDay(parseISO(validade.data.data_iso));
  const diasAntecedencia = validade.alerta?.dias_antecedencia ?? 0;

  if (diasAntecedencia <= 0) return false;

  // Se já venceu, não está mais "em alerta", está vencido
  if (isBefore(dataValidade, hoje) || isEqual(dataValidade, hoje)) {
    return false;
  }

  const inicioAlerta = subDays(dataValidade, diasAntecedencia);

  // Dentro do período: inicioAlerta <= hoje < dataValidade
  const depoisOuIgualInicio =
    isAfter(hoje, inicioAlerta) || isEqual(hoje, inicioAlerta);
  const antesDaValidade = isBefore(hoje, dataValidade);

  return depoisOuIgualInicio && antesDaValidade;
}

export function formatarValidadeComStatus(validade: IValidade): IValidadeComStatus {
  // VENCIDO e ENCERRADO são histórico congelado, não recalcula
  const ehHistoricoCongelado = 
    validade.validade === 'encerrado' || validade.validade === 'vencido';

  const validadeCalculada = ehHistoricoCongelado
    ? validade.validade
    : calcularStatusValidade(validade.data.data_iso, validade.alerta.dias_antecedencia);

  return {
    ...validade,
    validade: validadeCalculada,
    dentro_do_periodo_alerta: calcularDentroDoPeriodoAlerta(validade),
    data_inicio_alerta: calcularDataInicioAlerta(
      validade.data.data_iso,
      validade.alerta.dias_antecedencia
    ),
  };
}