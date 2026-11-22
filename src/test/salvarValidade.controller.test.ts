// test/salvarValidade.controller.test.ts
// Testa o controller plugado com Camada 1, sem banco real.
// Mocka ProdutoModel e ValidadeModel.

 //npx tsx --test src/test/salvarValidade.controller.test.ts

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Ajuste esses caminhos para os reais do seu projeto
import { salvarValidade } from '../controllers/validade.controller.js'; 
import { ProdutoModel } from '../models/Produto.js'; 
import { ValidadeModel } from '../models/Validade.js'; 

function mockRes() {
  const res: any = {};
  res.statusCode = 0;
  res.body = null;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  return res;
}

function mockReq(body: any) {
  return { body } as any;
}

function mockNext() {
  const fn: any = (err?: any) => { fn.error = err; };
  fn.error = null;
  return fn;
}

describe('salvarValidade com Camada 1 plugada', () => {
  beforeEach(() => {
    // Reseta os mocks a cada teste
    (ProdutoModel as any).findById = async () => null;
    (ValidadeModel as any).findOne = async () => null;
    (ValidadeModel as any).create = async (doc: any) => ({
      toObject: () => ({ _id: '123', ...doc }),
    });
  });

  it('cria com sucesso quando tudo está certo', async () => {
    (ProdutoModel as any).findById = async () => ({
      _id: '507f1f77bcf86cd799439011',
      codigoBarras: '7891234567890',
      nome: 'Leite Integral',
      lean: () => {},
    });

    // ProdutoModel.findById().lean() - o controller usa .lean()
    // Por isso mockamos retornando objeto com .lean()
    (ProdutoModel as any).findById = () => ({
      lean: async () => ({
        _id: '507f1f77bcf86cd799439011',
        codigoBarras: '7891234567890',
        nome: 'Leite Integral',
      }),
    });
    (ValidadeModel as any).findOne = () => ({
      lean: async () => null,
    });

    const req = mockReq({
      data: { ano: 2027, mes: 1, dia: 15, data_iso: '2027-01-15', data_original: '15 JAN 27' },
      produto: { _id_produto: '507f1f77bcf86cd799439011' },
      alerta: { dias_antecedencia: 7 },
    });
    const res = mockRes();
    const next = mockNext();

    await salvarValidade(req, res, next);

    assert.equal(next.error, null);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.sucesso, true);
    assert.equal(res.body.dados.validade, 'espera');
  });

  it('barra data passada via Camada 1', async () => {
    (ProdutoModel as any).findById = () => ({
      lean: async () => ({ _id: '507f1f77bcf86cd799439011', codigoBarras: '1', nome: 'Leite' }),
    });
    (ValidadeModel as any).findOne = () => ({ lean: async () => null });

    const req = mockReq({
      data: { ano: 2020, mes: 1, dia: 1, data_iso: '2020-01-01', data_original: '01 JAN 20' },
      produto: { _id_produto: '507f1f77bcf86cd799439011' },
      alerta: { dias_antecedencia: 7 },
    });
    const res = mockRes();
    const next = mockNext();

    await salvarValidade(req, res, next);

    assert.ok(next.error);
    assert.equal(next.error.statusCode ?? next.error.status, 400);
  });

  it('barra duplicata via Camada 1 com 409', async () => {
    (ProdutoModel as any).findById = () => ({
      lean: async () => ({ _id: '507f1f77bcf86cd799439011', codigoBarras: '1', nome: 'Leite' }),
    });
    (ValidadeModel as any).findOne = () => ({
      lean: async () => ({ _id: 'duplicata' }),
    });

    const req = mockReq({
      data: { ano: 2027, mes: 1, dia: 15, data_iso: '2027-01-15', data_original: '15 JAN 27' },
      produto: { _id_produto: '507f1f77bcf86cd799439011' },
      alerta: { dias_antecedencia: 7 },
    });
    const res = mockRes();
    const next = mockNext();

    await salvarValidade(req, res, next);

    assert.ok(next.error);
    assert.equal(next.error.statusCode ?? next.error.status, 409);
  });

  it('barra alerta 0 via RF-15 do controller, antes da Camada 1', async () => {
    (ProdutoModel as any).findById = () => ({
      lean: async () => ({ _id: '507f1f77bcf86cd799439011', codigoBarras: '1', nome: 'Leite' }),
    });
    (ValidadeModel as any).findOne = () => ({ lean: async () => null });

    const req = mockReq({
      data: { ano: 2027, mes: 1, dia: 15, data_iso: '2027-01-15', data_original: '15 JAN 27' },
      produto: { _id_produto: '507f1f77bcf86cd799439011' },
      alerta: { dias_antecedencia: 0 },
    });
    const res = mockRes();
    const next = mockNext();

    await salvarValidade(req, res, next);

    assert.ok(next.error);
    assert.equal(next.error.statusCode ?? next.error.status, 400);
  });
    it('nasce em ALERTA quando já está dentro do período de alerta', async () => {
    (ProdutoModel as any).findById = () => ({
      lean: async () => ({ _id: '507f1f77bcf86cd799439011', codigoBarras: '1', nome: 'Leite' }),
    });
    (ValidadeModel as any).findOne = () => ({ lean: async () => null });

    // Data: hoje + 3 dias, alerta 7 dias -> 3 <= 7, já está em alerta
    const dataFutura = new Date();
    dataFutura.setDate(dataFutura.getDate() + 3);
    const ano = dataFutura.getFullYear();
    const mes = dataFutura.getMonth() + 1;
    const dia = dataFutura.getDate();
    const mesPad = String(mes).padStart(2, '0');
    const diaPad = String(dia).padStart(2, '0');
    const data_iso = `${ano}-${mesPad}-${diaPad}`;

    const req = mockReq({
      data: { ano, mes, dia, data_iso, data_original: `${diaPad}/${mesPad}/${ano}` },
      produto: { _id_produto: '507f1f77bcf86cd799439011' },
      alerta: { dias_antecedencia: 7 },
    });
    const res = mockRes();
    const next = mockNext();

    await salvarValidade(req, res, next);

    assert.equal(next.error, null);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.sucesso, true);
    assert.equal(res.body.dados.validade, 'alerta');
  });
});

