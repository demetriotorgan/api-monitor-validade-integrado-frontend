import { NextFunction, Request, Response } from 'express';
import { ValidadeModel } from '../models/Validade.js';
import { IValidade, IValidadeCreationPayload, IValidadeUpdatePayload, StatusValidade } from '../types/validade.types.js';
import { isValidObjectId } from 'mongoose';
import { calcularStatusValidade, formatarValidadeComStatus, isDataValidadeFutura } from '../utils/validade.utils.js';
import { ErroEdicao } from '../erros/app-error.js';
import { ProdutoModel } from '../models/Produto.js';

interface AlterarValidadeBody extends IValidadeUpdatePayload { }


export async function salvarValidade(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data, produto, alerta } = req.body;

    // 1. Campos obrigatórios - RF-11
    if (!data?.data_iso || !produto?._id_produto) {
      throw new ErroEdicao('Os campos "data.data_iso" e "produto._id_produto" são obrigatórios.', 400);
    }

    // RF-15: Tem que ser inteiro > 0
    if (
      !alerta ||
      typeof alerta.dias_antecedencia !== 'number' ||
      !Number.isInteger(alerta.dias_antecedencia) ||
      alerta.dias_antecedencia <= 0
    ) {
      throw new ErroEdicao(
        'O período de alerta deve ser um número inteiro maior que zero. Ex: 1, 3, 7.',
        400
      );
    }    

    // 2. Valida se o _id é ObjectId válido
    const idProduto = String(produto._id_produto);
    if (!isValidObjectId(idProduto)) {
      throw new ErroEdicao('ID do produto inválido.', 400);
    }

    // 3. RF-12: Busca o produto REAL no banco - não confia no front
    const produtoReal = await ProdutoModel.findById(idProduto).lean();
    if (!produtoReal) {
      throw new ErroEdicao('Produto não encontrado.', 404);
    }

    // 4. Valida data real - 31/02 não pode passar
    const camposData = ['ano', 'mes', 'dia', 'data_iso', 'data_original'] as const;
    const dataIncompleta = camposData.some((c) => data[c] === undefined || data[c] === null);
    if (dataIncompleta) {
      throw new ErroEdicao('Todos os campos de "data" devem ser preenchidos.', 400);
    }

    // RF-14
    if (!isDataValidadeFutura(data.data_iso)) {
      throw new ErroEdicao('A data de validade deve ser uma data futura. Não é possível criar registro com data no passado ou igual a hoje.', 400);
    }

    // RF-13: Só pode nascer em ESPERA
    // data_validade - dias_alerta > hoje
    const statusValidade = calcularStatusValidade(data.data_iso, alerta.dias_antecedencia);

    if (statusValidade !== 'espera') {
      throw new ErroEdicao(
        `Não é possível criar registro que já nasceria em ${statusValidade.toUpperCase()}. ` +
        `A data de validade menos o período de alerta já passou. ` +
        `Ajuste a data de validade ou reduza os dias de alerta.`,
        400
      );
    }

    // RF-16: Impedir duas validades iguais para o mesmo produto
    // Só bloqueia se o antigo ainda estiver ativo (espera / alerta / vencido)
    // Se o antigo está ENCERRADO, pode criar de novo
    const duplicata = await ValidadeModel.findOne({
      'produto._id_produto': produtoReal._id,
      'data.data_iso': data.data_iso,
      validade: { $in: ['espera', 'alerta', 'vencido'] },
    }).lean();

    if (duplicata) {
      throw new ErroEdicao(
        `Já existe um registro ativo para este produto com a mesma data de validade (${data.data_iso}). Encerre o registro antigo antes de criar um novo.`,
        409
      );
    }

    // 6. Monta o snapshot a partir do BANCO, não do front
    const novaValidade = await ValidadeModel.create({
      data,
      produto: {
        _id_produto: produtoReal._id,
        codigoBarras: produtoReal.codigoBarras, // já normalizado pelo RF-04
        nome: produtoReal.nome,
      },
      ml: {},
      alerta: {
        dias_antecedencia: alerta.dias_antecedencia,
      },
      validade: statusValidade,
    });


    // RF-19: Formata a resposta para expor os campos calculados
    // O create retorna um Document do Mongoose, precisa converter para objeto plain
    const validadeFormatada = formatarValidadeComStatus(
      novaValidade.toObject() as IValidade
    );

    res.status(201).json({
      sucesso: true,
      mensagem: 'Validade salva com sucesso.',
      dados: validadeFormatada,
    });
  } catch (error) {
    next(error);
  }
};

export async function alterarValidade(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { data, produto, ml, alerta, validade }: AlterarValidadeBody = req.body;

    if (!isValidObjectId(id)) {
      res.status(400).json({ sucesso: false, erro: 'ID da validade inválido' });
      return;
    }

    const validadeAtual = await ValidadeModel.findById(id).lean();

    if (!validadeAtual) {
      res.status(404).json({ sucesso: false, erro: 'Validade não encontrada.' });
      return;
    }

    // --- RF-20: Produto não pode ser trocado ---
    // A edição não quebra o vínculo com o produto
    if (produto !== undefined) {
      res.status(400).json({
        sucesso: false,
        erro: 'O produto vinculado não pode ser alterado. Crie um novo registro para outro produto.',
      });
      return;
    }

    if (ml !== undefined) {
      res.status(400).json({
        sucesso: false,
        erro: 'O campo "ml" não pode ser alterado manualmente.',
      });
      return;
    }

    // --- Encerramento: fluxo separado, sem outros campos ---
    const querEncerrar = validade !== undefined;
    const temOutroCampo = data !== undefined || alerta !== undefined;

    if (querEncerrar && temOutroCampo) {
      res.status(400).json({
        sucesso: false,
        erro: 'Ao encerrar uma validade, não envie outros campos para atualização.',
      });
      return;
    }

    if (querEncerrar) {
      if (validade !== 'encerrado') {
        res.status(400).json({
          sucesso: false,
          erro: 'Apenas a transição para "encerrado" é permitida manualmente.',
        });
        return;
      }

      // Só pode encerrar quem está em espera/alerta (status calculado)
      const statusParaEncerrar = calcularStatusValidade(
        validadeAtual.data.data_iso,
        validadeAtual.alerta.dias_antecedencia
      );

      if (statusParaEncerrar !== 'espera' && statusParaEncerrar !== 'alerta') {
        res.status(400).json({
          sucesso: false,
          erro: `Não é possível encerrar uma validade com status "${statusParaEncerrar}".`,
        });
        return;
      }

      const encerrada = await ValidadeModel.findByIdAndUpdate(
        id,
        { $set: { validade: 'encerrado' } },
        { new: true, runValidators: true }
      ).lean();

      res.status(200).json({
        sucesso: true,
        mensagem: 'Validade encerrada com sucesso.',
        dados: formatarValidadeComStatus(encerrada as unknown as IValidade),
      });
      return;
    }

    // --- RF-20A: Só pode editar registro ativo ---
    // Usa status CALCULADO, não o salvo no banco (que fica congelado em 'espera')
    const statusAtual = validadeAtual.validade === 'encerrado'
      ? 'encerrado'
      : calcularStatusValidade(
          validadeAtual.data.data_iso,
          validadeAtual.alerta.dias_antecedencia
        );

    if (statusAtual === 'encerrado' || statusAtual === 'vencido') {
      res.status(400).json({
        sucesso: false,
        erro: `Registro ${statusAtual.toUpperCase()} não pode ser editado. Crie um novo registro.`,
      });
      return;
    }

    // --- Validação dos campos novos ---
    let dataFinal = validadeAtual.data;
    let diasFinal = validadeAtual.alerta.dias_antecedencia;

    if (data !== undefined) {
      const camposObrigatorios = ['ano', 'mes', 'dia', 'data_iso', 'data_original'] as const;
      const dataIncompleta = camposObrigatorios.some(
        (campo) => data[campo] === undefined || data[campo] === null
      );

      if (dataIncompleta) {
        res.status(400).json({
          sucesso: false,
          erro: 'Ao atualizar a data, todos os campos (ano, mes, dia, data_iso, data_original) são obrigatórios.',
        });
        return;
      }

      dataFinal = data;
    }

    if (alerta !== undefined) {
      if (alerta.dias_antecedencia !== undefined) {
        // RF-20C + RF-15: tem que ser inteiro > 0
        if (
          typeof alerta.dias_antecedencia !== 'number' ||
          !Number.isInteger(alerta.dias_antecedencia) ||
          alerta.dias_antecedencia <= 0
        ) {
          res.status(400).json({
            sucesso: false,
            erro: 'O período de alerta deve ser um número inteiro maior que zero. Ex: 1, 3, 7.',
          });
          return;
        }
        diasFinal = alerta.dias_antecedencia;
      }
    }

    if (data === undefined && alerta === undefined) {
      res.status(400).json({
        sucesso: false,
        erro: 'Nenhum campo válido foi enviado para atualização. Envie "data" ou "alerta".',
      });
      return;
    }

    // --- RF-20B + RF-20C: Não pode ficar VENCIDO ---
    // data > hoje E data - alerta >= hoje
    // Aceita ESPERA e ALERTA, rejeita só VENCIDO (diferente do RF-13 que só aceita ESPERA)
    if (!isDataValidadeFutura(dataFinal.data_iso)) {
      res.status(400).json({
        sucesso: false,
        erro: 'A nova data de validade deve ser uma data futura. Não é possível alterar para data no passado ou igual a hoje.',
      });
      return;
    }

    const novoStatus = calcularStatusValidade(dataFinal.data_iso, diasFinal);

    if (novoStatus === 'vencido') {
      res.status(400).json({
        sucesso: false,
        erro: 'Não é possível alterar para uma situação de VENCIDO. A data de validade menos o período de alerta já passou. Ajuste a data ou reduza os dias de alerta.',
      });
      return;
    }

    // --- RF-20D: Não pode duplicar ---
    // Usa os valores FINAIS (mesclados), não só o que veio no body
    // Exclui ele mesmo com _id: { $ne: id }
    const duplicata = await ValidadeModel.findOne({
      _id: { $ne: id },
      'produto._id_produto': validadeAtual.produto._id_produto,
      'data.data_iso': dataFinal.data_iso,
      validade: { $in: ['espera', 'alerta', 'vencido'] },
    }).lean();

    if (duplicata) {
      res.status(409).json({
        sucesso: false,
        erro: `Já existe um registro para esse produto com essa data (${dataFinal.data_iso}).`,
      });
      return;
    }

    // --- RF-20: Atualiza no mesmo _id, sem tocar no produto ---
    const atualizacao: Record<string, unknown> = {
      validade: novoStatus, // salva o status novo calculado (espera ou alerta)
    };
    if (data !== undefined) atualizacao.data = data;
    if (alerta !== undefined) atualizacao.alerta = { dias_antecedencia: diasFinal };

    const validadeAtualizada = await ValidadeModel.findByIdAndUpdate(
      id,
      { $set: atualizacao },
      { new: true, runValidators: true }
    ).lean();

    if (!validadeAtualizada) {
      res.status(404).json({ sucesso: false, erro: 'Validade não encontrada.' });
      return;
    }

    // RF-19: Formata para já vir com data_inicio_alerta recalculado
    res.status(200).json({
      sucesso: true,
      mensagem: 'Validade atualizada com sucesso.',
      dados: formatarValidadeComStatus(validadeAtualizada as unknown as IValidade),
    });
  } catch (erro) {
    console.error('Erro ao alterar validade:', erro);

    if (erro instanceof Error && 'code' in erro && erro.code === 11000) {
      res.status(409).json({
        sucesso: false,
        erro: 'Já existe um registro para esse produto com essa data.',
      });
      return;
    }

    res.status(500).json({
      sucesso: false,
      erro: 'Erro interno ao alterar validade.',
    });
  }
}

export async function listarValidadePorId(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      res.status(400).json({
        sucesso: false,
        erro: 'ID da validade inválido',
      });
      return;
    }

    const validade = await ValidadeModel.findById(id).lean();

    if (!validade) {
      res.status(404).json({
        sucesso: false,
        erro: 'Validade não encontrada',
      });
      return;
    }

    // RF-19: Formata para expor status, dentro_do_periodo_alerta e data_inicio_alerta
    const validadeFormatada = formatarValidadeComStatus(validade as unknown as IValidade);

    res.status(200).json({
      sucesso: true,
      dados: validadeFormatada,
    });
  } catch (erro) {
    console.error('Erro ao buscar validade por ID:', erro);
    res.status(500).json({
      sucesso: false,
      erro: 'Erro interno ao buscar validade',
    });
  }
};

export async function deletarValidade(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;

    if (!id || !isValidObjectId(id)) {
      throw new ErroEdicao('ID da validade inválido', 400);
    }

    // 1. Busca primeiro para checar o status - não pode deletar direto
    const validade = await ValidadeModel.findById(id).lean();

    if (!validade) {
      throw new ErroEdicao('Validade não encontrada', 404);
    }

    // 2. TRAVA DE AUDITORIA - RF Histórico
    // vencido / encerrado = congelado, nunca deleta
    if (validade.validade === 'vencido' || validade.validade === 'encerrado') {
      throw new ErroEdicao(
        'Não é possível excluir validade vencida ou encerrada. Registro mantido para histórico e auditoria.',
        409
      );
    }

    // 3. Só chega aqui se for 'espera' ou 'alerta' - aí pode deletar
    const validadeDeletada = await ValidadeModel.findByIdAndDelete(id).lean();

    res.status(200).json({
      sucesso: true,
      mensagem: 'Validade deletada com sucesso',
      dados: validadeDeletada,
    });
  } catch (error) {
    next(error);
  }
}