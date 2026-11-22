import { NextFunction, Request, Response } from 'express';
import { startOfDay, subDays, isBefore, isAfter, isEqual, parseISO, format, differenceInCalendarDays } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ValidadeModel } from '../models/Validade.js';
import { IValidade, StatusValidade } from '../types/validade.types.js';
import { formatarValidadeComStatus, obterHojeBrasilia } from '../utils/validade.utils.js';
import { isValidObjectId } from 'mongoose';
import { AppError } from '../erros/app-error.js';
import { buscarAlertasPendentes } from '../validade-lifecycle/orquestrador/camada3-alertas.js';

const TIMEZONE = 'America/Sao_Paulo';
/**
 * Lista os registros de validade com seus status.
 *
 * O status é persistido no campo `validade` do documento e pode ser:
 * - "espera"  → data de validade futura, fora do período de alerta
 * - "alerta"  → data de validade futura, dentro do período de alerta
 * - "vencido" → data de validade igual ou anterior a hoje
 * - "encerrado" → monitoramento encerrado manualmente pelo operador
 *
 * Query params aceitos:
 *
 * @query status
 *   Filtra os registros pelo status persistido.
 *   Valores aceitos:
 *   - "ATIVA"   → retorna registros com validade "espera" OU "alerta"
 *                 (produtos ainda em monitoramento ativo)
 *   - "VENCIDA" → retorna registros com validade "vencido"
 *   - "espera"  → retorna apenas registros com validade "espera"
 *   - "alerta"  → retorna apenas registros com validade "alerta"
 *   - "vencido" → retorna apenas registros com validade "vencido"
 *   - "encerrado" → retorna apenas registros com validade "encerrado"
 *
 * @query apenas_alerta
 *   Quando informado como "true", sobrescreve qualquer filtro de status
 *   e retorna apenas registros com validade "alerta".
 *   Útil para dashboards/notificações.
 *
 * Exemplos de uso:
 *   GET /api/com-status?status=ATIVA
 *   GET /api/com-status?status=VENCIDA
 *   GET /api/com-status?status=alerta
 *   GET /api/com-status?apenas_alerta=true
 *
 * Regras de negócio (data de referência: 17/11/2026):
 *   - Hoje é considerado "vencido" (data_iso <= hoje)
 *   - Alerta inicia quando: dias_restantes <= dias_antecedencia
 *     Ex: dias_antecedencia=5 → alerta de 18/11 até 22/11
 *   - Encerrado é manual: não entra em ATIVA nem VENCIDA
 *
 * Retorno inclui:
 *   - Todos os campos do documento
 *   - dias_restantes: número de dias até a validade (null para vencido/encerrado)
 */
const STATUS_VALIDOS: StatusValidade[] = ['espera', 'alerta', 'vencido', 'encerrado'];

export async function listarValidadesComStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, apenas_alerta } = req.query;

    // RF-21: Valida o parâmetro, mas NÃO filtra no banco por status calculado
    let statusFiltro: StatusValidade | 'ativa' | 'vencida' | undefined;

    if (status !== undefined) {
      const statusStr = String(status).toLowerCase();

      if (statusStr === 'ativa' || statusStr === 'vencida') {
        statusFiltro = statusStr;
      } else if (STATUS_VALIDOS.includes(statusStr as StatusValidade)) {
        statusFiltro = statusStr as StatusValidade;
      } else {
        // ANTES: res.status(400).json(...)
        // AGORA: AppError com codigo, via next()
        return next(
          new AppError(
            `Status inválido. Valores aceitos: ATIVA, VENCIDA, ${STATUS_VALIDOS.join(', ')}.`,
            400,
            'STATUS_INVALIDO'
          )
        );
      }
    }

    if (apenas_alerta === 'true') {
      statusFiltro = 'alerta';
    }

    // RF-21: Só ENCERRADO é armazenado, então só ele pode filtrar no Mongo.
    // ESPERA / ALERTA / VENCIDO são calculados, então busca tudo e filtra depois.
    // Otimização: se o filtro for só 'encerrado', filtra no banco mesmo.
    const filtroBanco: Record<string, unknown> = {};
    if (statusFiltro === 'encerrado') {
      filtroBanco.validade = 'encerrado';
    }

    const registros = await ValidadeModel
      .find(filtroBanco)
      .sort({ _id: -1 })
      .lean();

    const hoje = obterHojeBrasilia();

    // RF-21 + RF-19: Calcula o status na hora para cada registro
    // Camada 1 aqui dentro: formatarValidadeComStatus -> calcularStatusValidade
    const formatados = registros.map((registro) => {
      const validadeDoc = registro as unknown as IValidade;
      const formatada = formatarValidadeComStatus(validadeDoc);

      const diasRestantes = formatada.validade === 'encerrado'
        ? null
        : differenceInCalendarDays(parseISO(validadeDoc.data.data_iso), hoje);

      return {
        ...formatada,
        dias_restantes: diasRestantes,
      };
    });

    // RF-21: Filtra pelo status CALCULADO, não pelo salvo
    const resultado = formatados.filter((item) => {
      if (!statusFiltro) return true;
      if (statusFiltro === 'ativa') return item.validade === 'espera' || item.validade === 'alerta';
      if (statusFiltro === 'vencida') return item.validade === 'vencido';
      return item.validade === statusFiltro;
    });

    res.status(200).json({
      sucesso: true,
      dados: resultado,
    });
  } catch (erro) {
    // ANTES: res.status(500).json({ sucesso: false... })
    // AGORA: repassa para o middleware de erro, que já trata AppError
    console.error('Erro ao listar validades com status:', erro);
    next(erro);
  }
};


// src/controllers/validade.alertas.controller.ts
// Controller fino: só chama Camada 03, não decide, não filtra no banco.

export async function listarAlertasPendentes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { pendentes, data_referencia, quantidade } = await buscarAlertasPendentes();

    res.status(200).json({
      sucesso: true,
      dados: pendentes,
      data_referencia,
      quantidade,
    });
  } catch (erro) {
    console.error('Erro ao listar alertas pendentes:', erro);
    next(erro);
  }
};

export async function confirmarEnvioAlerta(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      res.status(400).json({
        sucesso: false,
        mensagem: 'ID da validade inválido.',
      });
      return;
    }

    const validade = await ValidadeModel.findById(id).lean();

    if (!validade) {
      res.status(404).json({
        sucesso: false,
        mensagem: 'Registro de validade não encontrado.',
      });
      return;
    }

    if (validade.validade !== 'alerta') {
      res.status(400).json({
        sucesso: false,
        mensagem: `Não é possível confirmar envio de alerta para uma validade com status "${validade.validade}". Apenas validades em "alerta" podem receber confirmação de envio.`,
      });
      return;
    }

    const atualizado = await ValidadeModel.findByIdAndUpdate(
      id,
      { 'alerta.ultimo_envio_em': new Date() },
      { new: true, runValidators: true }
    );

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


//Limpar todos os registro de validade do banco
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