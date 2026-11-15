import { Request, Response } from 'express';
import { ValidadeModel } from '../models/Validade.js';
import { IValidadeCreationPayload, IValidadeUpdatePayload } from '../types/validade.types.js';
import { isValidObjectId } from 'mongoose';

interface CriarValidadeBody extends IValidadeCreationPayload { }
interface AlterarValidadeBody extends IValidadeUpdatePayload {}


export async function salvarValidade(req: Request, res: Response): Promise<void> {
  try {
    const { data, produto, ml, alerta }: CriarValidadeBody = req.body;

    if (!data || !produto) {
      res.status(400).json({
        sucesso: false,
        mensagem: 'Os campos "data" e "produto" são obrigatórios.',
      });
      return;
    }

    if (!alerta || typeof alerta.dias_antecedencia !== 'number') {
      res.status(400).json({
        sucesso: false,
        mensagem: 'O campo "alerta.dias_antecedencia" é obrigatório e deve ser um número.',
      });
      return;
    }

    const camposData = ['ano', 'mes', 'dia', 'data_iso', 'data_original'] as const;
    const camposProduto = ['_id_produto', 'codigo_barras', 'nome'] as const;
    

    const dataIncompleta = camposData.some((campo) => data[campo] === undefined || data[campo] === null);
    const produtoIncompleto = camposProduto.some((campo) => produto[campo] === undefined || produto[campo] === null);

    if (dataIncompleta || produtoIncompleto) {
      res.status(400).json({
        sucesso: false,
        mensagem: 'Todos os campos de "data" e "produto" devem ser preenchidos.',
      });
      return;
    }

    const novaValidade = new ValidadeModel({
      data,
      produto,
      ml: ml ?? {},
      alerta
    });

    const validadeSalva = await novaValidade.save();

    res.status(201).json({
      sucesso: true,
      mensagem: 'Validade salva com sucesso.',
      dados: validadeSalva,
    });
  } catch (erro) {
    console.error('Erro ao salvar validade:', erro);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao salvar a validade.',
    });
  }
}

export async function alterarValidade(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { data, produto, ml, alerta }: AlterarValidadeBody = req.body;

    if (!isValidObjectId(id)) {
      res.status(400).json({
        sucesso: false,
        erro: 'ID da validade inválido',
      });
      return;
    }

    const atualizacao: Record<string, unknown> = {};

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

      atualizacao.data = data;
    }

    if (produto !== undefined) {
      const camposObrigatorios = ['_id_produto', 'codigo_barras', 'nome'] as const;
      const produtoIncompleto = camposObrigatorios.some(
        (campo) => produto[campo] === undefined || produto[campo] === null
      );

      if (produtoIncompleto) {
        res.status(400).json({
          sucesso: false,
          erro: 'Ao atualizar o produto, todos os campos (_id_produto, codigo_barras, nome) são obrigatórios.',
        });
        return;
      }

      atualizacao.produto = produto;
    }

    if (ml !== undefined) {
      atualizacao.ml = ml;
    }

    if (alerta !== undefined) {
      if (alerta.dias_antecedencia !== undefined) {
        if (typeof alerta.dias_antecedencia !== 'number' || alerta.dias_antecedencia < 1) {
          res.status(400).json({
            sucesso: false,
            erro: 'dias_antecedencia deve ser um número maior ou igual a 1.',
          });
          return;
        }
      }

      atualizacao.alerta = alerta;
    }

    if (Object.keys(atualizacao).length === 0) {
      res.status(400).json({
        sucesso: false,
        erro: 'Nenhum campo válido foi enviado para atualização.',
      });
      return;
    }

    const validadeAtualizada = await ValidadeModel.findByIdAndUpdate(
      id,
      { $set: atualizacao },
      { new: true, runValidators: true }
    ).lean();

    if (!validadeAtualizada) {
      res.status(404).json({
        sucesso: false,
        erro: 'Validade não encontrada.',
      });
      return;
    }

    res.status(200).json({
      sucesso: true,
      mensagem: 'Validade atualizada com sucesso.',
      dados: validadeAtualizada,
    });
  } catch (erro) {
    console.error('Erro ao alterar validade:', erro);

    if (erro instanceof Error && 'code' in erro && erro.code === 11000) {
      res.status(409).json({
        sucesso: false,
        erro: 'Conflito ao atualizar validade.',
      });
      return;
    }

    res.status(500).json({
      sucesso: false,
      erro: 'Erro interno ao alterar validade.',
    });
  }
};

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

    res.status(200).json({
      sucesso: true,
      dados: validade,
    });
  } catch (erro) {
    console.error('Erro ao buscar validade por ID:', erro);
    res.status(500).json({
      sucesso: false,
      erro: 'Erro interno ao buscar validade',
    });
  }
};

export async function deletarValidade(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      res.status(400).json({
        sucesso: false,
        erro: 'ID da validade inválido',
      });
      return;
    }

    const validadeDeletada = await ValidadeModel.findByIdAndDelete(id).lean();

    if (!validadeDeletada) {
      res.status(404).json({
        sucesso: false,
        erro: 'Validade não encontrada',
      });
      return;
    }

    res.status(200).json({
      sucesso: true,
      mensagem: 'Validade deletada com sucesso',
      dados: validadeDeletada,
    });
  } catch (erro) {
    console.error('Erro ao deletar validade:', erro);
    res.status(500).json({
      sucesso: false,
      erro: 'Erro interno ao deletar validade',
    });
  }
};