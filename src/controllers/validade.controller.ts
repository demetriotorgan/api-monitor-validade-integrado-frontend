import { Request, Response } from 'express';
import { ValidadeModel } from '../models/Validade.js';
import { IValidadeCreationPayload } from '../types/validade.types.js';

interface CriarValidadeBody extends IValidadeCreationPayload { }

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
