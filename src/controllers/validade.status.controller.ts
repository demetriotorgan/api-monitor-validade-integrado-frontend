import { Request, Response } from 'express';
import { startOfDay, subDays, isBefore, isAfter, isEqual, parseISO, format, differenceInCalendarDays } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ValidadeModel } from '../models/Validade.js';
import { IValidade } from '../types/validade.types.js';

const TIMEZONE = 'America/Sao_Paulo';

type StatusValidade = 'ATIVA' | 'VENCIDA';

interface IValidadeComStatus extends IValidade {
  status: StatusValidade;
  dentro_do_periodo_alerta: boolean;
}

function obterHojeBrasilia(): Date {
  const agoraUtc = new Date();
  const hojeBrasilia = toZonedTime(agoraUtc, TIMEZONE);
  return startOfDay(hojeBrasilia);
}

function calcularStatus(validade: IValidade): StatusValidade {
  const hoje = obterHojeBrasilia();
  const dataValidade = startOfDay(parseISO(validade.data.data_iso));

  if (isBefore(dataValidade, hoje)) {
    return 'VENCIDA';
  }
  return 'ATIVA';
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

function formatarValidadeComStatus(validade: IValidade): IValidadeComStatus {
  return {
    // espalha todas as propriedades que já estão no objeto plain
    ...validade,
    // adiciona os campos calculados
    status: calcularStatus(validade),
    dentro_do_periodo_alerta: calcularDentroDoPeriodoAlerta(validade),
  };
}

/**
 * GET /validades/com-status
 * Query params opcionais:
 *  - status: 'ATIVA' | 'VENCIDA'
 *  - apenas_alerta: 'true' (filtra só as dentro do período de alerta)
 */
export async function listarValidadesComStatus(req: Request, res: Response): Promise<void> {
  try {
    const { status, apenas_alerta } = req.query;

    const filtro: Record<string, unknown> = {};

    if (status === 'ATIVA' || status === 'VENCIDA') {
      const hojeStr = format(obterHojeBrasilia(), 'yyyy-MM-dd');

      if (status === 'ATIVA') {
        filtro['data.data_iso'] = { $gte: hojeStr };
      } else {
        filtro['data.data_iso'] = { $lt: hojeStr };
      }
    }

    const hoje = obterHojeBrasilia();

    const registros = await ValidadeModel
      .find(filtro)
      .sort({ _id: -1 })
      .lean();

    let resultado = registros.map((registro) => {
      const validadeFormatada = formatarValidadeComStatus(registro as unknown as IValidade);
      const diasRestantes =
        validadeFormatada.status === 'ATIVA' ?
          differenceInCalendarDays(parseISO(registro.data.data_iso as string), hoje) : null;
      return {
        ...validadeFormatada,
        dias_restantes: diasRestantes
      }
    });

    if (apenas_alerta === 'true') {
      resultado = resultado.filter((item) => item.dentro_do_periodo_alerta);
    }

    res.status(200).json({
      sucesso: true,
      dados: resultado,
    });
  } catch (erro) {
    console.error('Erro ao listar validades com status:', erro);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao listar validades.',
    });
  }
}

/**
 * GET /validades/alertas-pendentes
 * Retorna as validades que devem constar no relatório diário.
 */
export async function listarAlertasPendentes(req: Request, res: Response): Promise<void> {
  try {
    const hoje = obterHojeBrasilia();
    const hojeStr = format(hoje, 'yyyy-MM-dd');

    // Data mínima = hoje (não queremos vencidos)
    // Data máxima = hoje + dias_antecedencia
    // E que ainda não foram enviadas hoje
    const registros = await ValidadeModel.find({
      'data.data_iso': { $gte: hojeStr },
      $or: [
        { 'alerta.ultimo_envio_em': { $exists: false } },
        { 'alerta.ultimo_envio_em': { $lt: fromZonedTime(startOfDay(hoje), TIMEZONE) } },
      ],
    }).sort({ 'data.data_iso': 1 });

    const resultado = registros
      .map((registro) => formatarValidadeComStatus(registro))
      .filter((item) => item.dentro_do_periodo_alerta);

    res.status(200).json({
      sucesso: true,
      dados: resultado,
      data_referencia: hojeStr,
      quantidade: resultado.length,
    });
  } catch (erro) {
    console.error('Erro ao listar alertas pendentes:', erro);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao listar alertas pendentes.',
    });
  }
}

/**
 * PATCH /validades/:id/confirmar-envio
 * Marca o alerta como enviado hoje.
 * Será usado pelo worker após enviar o relatório.
 */
export async function confirmarEnvioAlerta(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const atualizado = await ValidadeModel.findByIdAndUpdate(
      id,
      { 'alerta.ultimo_envio_em': new Date() },
      { new: true }
    );

    if (!atualizado) {
      res.status(404).json({
        sucesso: false,
        mensagem: 'Registro de validade não encontrado.',
      });
      return;
    }

    res.status(200).json({
      sucesso: true,
      mensagem: 'Envio de alerta confirmado.',
      dados: atualizado,
    });
  } catch (erro) {
    console.error('Erro ao confirmar envio de alerta:', erro);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao confirmar envio de alerta.',
    });
  }
}

export async function limparTodasValidades(req: Request, res: Response): Promise<void> {
  try {
    const resultado = await ValidadeModel.deleteMany({});

    res.status(200).json({
      sucesso: true,
      mensagem: 'Todos os registros de validade foram removidos.',
      removidos: resultado.deletedCount ?? 0,
    });
  } catch (erro) {
    console.error('Erro ao limpar registros de validade:', erro);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao limpar registros de validade.',
    });
  }
}