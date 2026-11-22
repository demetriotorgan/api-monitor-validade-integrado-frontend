import { Request, Response } from 'express';
import { startOfDay, subDays, isBefore, isAfter, isEqual, parseISO, format, differenceInCalendarDays } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ValidadeModel } from '../models/Validade.js';
import { IValidade, StatusValidade } from '../types/validade.types.js';
import { formatarValidadeComStatus, obterHojeBrasilia } from '../utils/validade.utils.js';
import { isValidObjectId } from 'mongoose';

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

export async function listarValidadesComStatus(req: Request, res: Response): Promise<void> {
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
        res.status(400).json({
          sucesso: false,
          mensagem: `Status inválido. Valores aceitos: ATIVA, VENCIDA, ${STATUS_VALIDOS.join(', ')}.`,
        });
        return;
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
    console.error('Erro ao listar validades com status:', erro);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao listar validades.',
    });
  }
};

/**
 * Lista alertas de validade pendentes de envio.
 *
 * Esta rota é usada pelo sistema de notificações para identificar
 * quais registros de validade devem receber alerta no dia atual.
 *
 * Critérios de inclusão:
 * 1. O campo `validade` deve ser exatamente "alerta".
 * 2. A data de validade (`data.data_iso`) deve ser igual ou posterior a hoje.
 * 3. O alerta ainda não pode ter sido enviado hoje, ou seja:
 *    - `alerta.ultimo_envio_em` não existe, ou
 *    - `alerta.ultimo_envio_em` é null, ou
 *    - `alerta.ultimo_envio_em` é anterior ao início do dia atual (Brasília).
 */

export async function listarAlertasPendentes(req: Request, res: Response): Promise<void> {
  try {
    const hoje = obterHojeBrasilia();
    const hojeStr = format(hoje, 'yyyy-MM-dd');
    const inicioDoDia = fromZonedTime(startOfDay(hoje), TIMEZONE);

    const registros = await ValidadeModel.find({
      validade: 'alerta',
      'data.data_iso': { $gte: hojeStr },
      $or: [
        { 'alerta.ultimo_envio_em': { $exists: false } },
        { 'alerta.ultimo_envio_em': null },
        { 'alerta.ultimo_envio_em': { $lt: inicioDoDia } },
      ],
    })
      .sort({ 'data.data_iso': 1 })
      .lean<IValidade[]>();

    res.status(200).json({
      sucesso: true,
      dados: registros,
      data_referencia: hojeStr,
      quantidade: registros.length,
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
 *
 * Marca o alerta de uma validade como enviado no dia atual.
 * Este controller deve ser chamado pelo worker de notificações
 * imediatamente após o envio do alerta ao responsável.
 *
 * Regras de negócio:
 * - O ID informado deve ser um ObjectId válido do MongoDB.
 * - O registro de validade deve existir.
 * - Apenas registros com status "alerta" podem ter o envio confirmado.
 *   Status como "espera", "vencido" ou "encerrado" são rejeitados.
 * - O campo `alerta.ultimo_envio_em` é atualizado com o timestamp atual em UTC.
 *
 * Comportamento esperado:
 * Após a confirmação, o registro não deve mais aparecer em
 * GET /alertas-pendentes até o início do próximo dia (fuso America/Sao_Paulo),
 * garantindo que cada alerta seja enviado no máximo uma vez por dia.
 *
 * Exemplo de uso:
 * PATCH /validades/6afc8f2b68f902dfbd3f8304/confirmar-envio
 *
 * Retorno de sucesso:
 * {
 *   "sucesso": true,
 *   "mensagem": "Envio de alerta confirmado.",
 *   "dados": { ... }
 * }
 */
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