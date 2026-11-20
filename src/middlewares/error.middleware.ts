import { Request, Response, NextFunction } from 'express';
import { AppError } from '../erros/app-error.js'; 

export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // 1. Erro nosso (RF-32 / 33 / 35) -> usa o status e código da classe
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      sucesso: false,
      erro: error.message,
      codigo: error.codigo,
    });
    return;
  }

  // 2. Erro desconhecido -> 500 genérico, sem vazar detalhe
  console.error('Erro não tratado:', error);
  res.status(500).json({
    sucesso: false,
    erro: 'Erro interno do servidor',
    codigo: 'ERRO_INTERNO',
  });
}