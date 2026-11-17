// utils/validade.utils.ts
import { parseISO, startOfDay, isBefore, isEqual, differenceInCalendarDays, subDays, isAfter } from 'date-fns';
import { IValidade, IValidadeComStatus, StatusValidade } from '../types/validade.types.js';
import { toZonedTime } from 'date-fns-tz';

/**
 * Calcula o status inicial de uma validade com base na data de vencimento
 * e nos dias de antecedência configurados no alerta.
 */

const TIMEZONE_BRASIL = 'America/Sao_Paulo';

export function calcularStatusValidade(dataIso: string, diasAntecedencia: number): StatusValidade {
  const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE_BRASIL });
  const hoje = startOfDay(parseISO(hojeStr));
  const dataValidade = startOfDay(parseISO(dataIso));

  if (isBefore(dataValidade, hoje) || isEqual(dataValidade, hoje)) {
    return 'vencido';
  }

  const diasRestantes = differenceInCalendarDays(dataValidade, hoje);

  if (diasRestantes <= diasAntecedencia) {
    return 'alerta';
  }

  return 'espera';
}

export function obterHojeBrasilia(): Date {
  const agoraUtc = new Date();
  const hojeBrasilia = toZonedTime(agoraUtc, TIMEZONE_BRASIL);
  return startOfDay(hojeBrasilia);
}

function calcularStatus(validade: IValidade): StatusValidade {
  const hoje = obterHojeBrasilia();
  const dataValidade = startOfDay(parseISO(validade.data.data_iso));

  if (isBefore(dataValidade, hoje)) {
    return 'vencido';
  }
  return 'espera';
}

function calcularDentroDoPeriodoAlerta(validade: IValidade): boolean {
  const hoje = obterHojeBrasilia();
  const dataValidade = startOfDay(parseISO(validade.data.data_iso));
  const diasAntecedencia = validade.alerta?.dias_antecedencia ?? 0;

  if (diasAntecedencia <= 0) return false;

  const inicioAlerta = subDays(dataValidade, diasAntecedencia);

  // Dentro do período: inicioAlerta <= hoje <= dataValidade
  const depoisOuIgualInicio =
    isAfter(hoje, inicioAlerta) || isEqual(hoje, inicioAlerta);
  const antesOuIgualValidade =
    isBefore(hoje, dataValidade) || isEqual(hoje, dataValidade);

  return depoisOuIgualInicio && antesOuIgualValidade;
}

export function formatarValidadeComStatus(validade: IValidade): IValidadeComStatus {
  return {
    // espalha todas as propriedades que já estão no objeto plain
    ...validade,
    // adiciona os campos calculados
    status: calcularStatus(validade),
    dentro_do_periodo_alerta: calcularDentroDoPeriodoAlerta(validade),
  };
}