import { NextFunction, Request, Response } from "express";
import { buscarAlertasPendentes } from "../validade-lifecycle/orquestrador/camada3-alertas.js";
import { isValidObjectId } from "mongoose";
import { ValidadeModel } from "../models/Validade.js";

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