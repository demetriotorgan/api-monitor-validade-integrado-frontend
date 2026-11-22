// src/test/deletarValidade.controllers.test.ts
// Teste do controller deletarValidade
// Padrão igual a encerrarValidade e corrigirValidade:
// - Controller real, Model mockado, Camada 2 real

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { deletarValidade } from '../controllers/validade.controller.js'; 
import { ValidadeModel } from '../models/Validade.js';

// Mocka o Model - não toca no banco de verdade
vi.mock('../models/Validade.js', () => ({
  ValidadeModel: {
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));

const findByIdMock = vi.mocked(ValidadeModel.findById);
const findByIdAndDeleteMock = vi.mocked(ValidadeModel.findByIdAndDelete);

// Helpers de data local - igual ao teste de corrigir
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasDepois(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

function diasAntes(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoLocal(d);
}

// Monta um registro do banco
function montarRegistroNoBanco(overrides: any = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    validade: 'espera',
    data: { data_iso: diasDepois(30), ano: 2026, mes: 12, dia: 15 },
    alerta: { dias_antecedencia: 7 },
    ...overrides,
  };
}

// Monta req/res/next mockados
function montarMocks(id: string) {
  const req = {
    params: { id },
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('deletarValidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deleta registro em espera -> 200', async () => {
    const registro = montarRegistroNoBanco({
      validade: 'espera',
      data: { data_iso: diasDepois(30) },
      alerta: { dias_antecedencia: 7 },
    });

    findByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(registro) } as any);
    findByIdAndDeleteMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(registro) } as any);

    const { req, res, next } = montarMocks('507f1f77bcf86cd799439011');

    await deletarValidade(req, res, next);

    expect(findByIdAndDeleteMock).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('deleta registro em alerta -> 200', async () => {
    // Data daqui a 3 dias, alerta 7 dias = dentro do período, status real = alerta
    const registro = montarRegistroNoBanco({
      validade: 'alerta',
      data: { data_iso: diasDepois(3) },
      alerta: { dias_antecedencia: 7 },
    });

    findByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(registro) } as any);
    findByIdAndDeleteMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(registro) } as any);

    const { req, res, next } = montarMocks('507f1f77bcf86cd799439011');

    await deletarValidade(req, res, next);

    expect(findByIdAndDeleteMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('bloqueia deletar registro encerrado -> 409 JA_ENCERRADO', async () => {
    const registro = montarRegistroNoBanco({
      validade: 'encerrado',
      data: { data_iso: diasDepois(30) },
      alerta: { dias_antecedencia: 7 },
    });

    findByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(registro) } as any);

    const { req, res, next } = montarMocks('507f1f77bcf86cd799439011');

    await deletarValidade(req, res, next);

    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    const erro = (next as any).mock.calls[0][0];
    expect(erro.statusCode).toBe(409);
    expect(erro.codigo).toBe('JA_ENCERRADO');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('bloqueia deletar registro vencido no banco -> 409 JA_VENCIDO', async () => {
    const registro = montarRegistroNoBanco({
      validade: 'vencido',
      data: { data_iso: diasAntes(5) },
      alerta: { dias_antecedencia: 7 },
    });

    findByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(registro) } as any);

    const { req, res, next } = montarMocks('507f1f77bcf86cd799439011');

    await deletarValidade(req, res, next);

    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    const erro = (next as any).mock.calls[0][0];
    expect(erro.statusCode).toBe(409);
    expect(erro.codigo).toBe('JA_VENCIDO');
  });

  it('bloqueia deletar quando banco diz espera mas cálculo diz vencido -> 409 JA_VENCIDO', async () => {
    // ESSE É O TESTE DO BUG QUE A GENTE CORRIGIU
    // Banco desatualizado diz espera, mas data já passou
    const registro = montarRegistroNoBanco({
      validade: 'espera', // banco errado
      data: { data_iso: diasAntes(2) }, // real = vencido
      alerta: { dias_antecedencia: 7 },
    });

    findByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(registro) } as any);

    const { req, res, next } = montarMocks('507f1f77bcf86cd799439011');

    await deletarValidade(req, res, next);

    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    const erro = (next as any).mock.calls[0][0];
    expect(erro.statusCode).toBe(409);
    expect(erro.codigo).toBe('JA_VENCIDO');
    expect(erro.mensagem || erro.message).toMatch(/vencida|histórico/i);
  });

  it('bloqueia deletar quando banco diz alerta mas cálculo diz vencido -> 409 JA_VENCIDO', async () => {
    const registro = montarRegistroNoBanco({
      validade: 'alerta', // banco errado
      data: { data_iso: diasAntes(1) }, // real = vencido
      alerta: { dias_antecedencia: 7 },
    });

    findByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(registro) } as any);

    const { req, res, next } = montarMocks('507f1f77bcf86cd799439011');

    await deletarValidade(req, res, next);

    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    const erro = (next as any).mock.calls[0][0];
    expect(erro.codigo).toBe('JA_VENCIDO');
  });

  it('retorna 404 se registro não existe', async () => {
    findByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);

    const { req, res, next } = montarMocks('507f1f77bcf86cd799439011');

    await deletarValidade(req, res, next);

    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    const erro = (next as any).mock.calls[0][0];
    expect(erro.statusCode).toBe(404);
    expect(erro.codigo).toBe('NAO_ENCONTRADO');
  });

  it('retorna 400 se ID inválido', async () => {
    const { req, res, next } = montarMocks('id-invalido');

    await deletarValidade(req, res, next);

    expect(findByIdMock).not.toHaveBeenCalled();
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    const erro = (next as any).mock.calls[0][0];
    expect(erro.statusCode).toBe(400);
    expect(erro.codigo).toBe('ID_INVALIDO');
  });

  it('não deleta se Camada 2 bloquear', async () => {
    const registro = montarRegistroNoBanco({
      validade: 'encerrado',
      data: { data_iso: diasDepois(30) },
      alerta: { dias_antecedencia: 7 },
    });

    findByIdMock.mockReturnValue({ lean: vi.fn().mockResolvedValue(registro) } as any);

    const { req, res, next } = montarMocks('507f1f77bcf86cd799439011');

    await deletarValidade(req, res, next);

    // Prova que o bloqueio aconteceu antes do delete
    expect(findByIdMock).toHaveBeenCalledTimes(1);
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});