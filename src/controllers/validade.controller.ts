
import type { Request, Response } from 'express';

export function processarImagem(req: Request, res: Response,): void {
  if (!req.file) {
    res.status(400).json({
      sucesso: false,
      erro: 'Envie uma imagem no campo "imagem".',
    });
    return;
  }

  res.status(200).json({
    sucesso: true,
    mensagem: 'Imagem recebida com sucesso.',
    arquivo: {
      nome: req.file.originalname,
      tipo: req.file.mimetype,
      tamanhoBytes: req.file.size,
    },
  });   
}
