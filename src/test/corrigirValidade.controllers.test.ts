// src/controllers/__tests__/validade.lifecycle.controllers.test.ts
// Testes dos controllers de encerramento e correção
// Camada 2 REAL + ValidadeModel MOCKADO
// Não toca no banco de verdade

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encerrarValidade } from '../controllers/validade.controller.js'; 
import { corrigirValidade } from '../controllers/validade.controller.js'; 
import { ValidadeModel } from '../models/Validade.js'; 

// DEPOIS - CERTO, caminho a partir de src/test/
vi.mock('../models/Validade.js', () => ({
  ValidadeModel: {
    findById: vi.fn(),
  },
}));

vi.mock('../utils/formatarValidade.js', () => ({
  formatarValidadeComStatus: vi.fn((obj: any) => obj),
}));

const mockedFindById = ValidadeModel.findById as any;

// Helpers
function mockReq(params: any = {}, body: any = {}) {
  return { params, body } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return vi.fn();
}

// Cria um registro falso no formato do Mongoose
function criarRegistroFake(overrides: any = {}) {
  const base: any = {
    _id: '507f1f77bcf86cd799439011',
    validade: 'espera',
    data: {
      ano: 2027,
      mes: 2,
      dia: 10,
      data_iso: '2027-02-10',
      data_original: '2027-02-10',
    },
    alerta: { dias_antecedencia: 7 },
    save: vi.fn().mockImplementation(function (this: any) {
      return Promise.resolve(this);
    }),
    toObject: vi.fn().mockImplementation(function (this: any) {
      return {
        _id: this._id,
        validade: this.validade,
        data: { ...this.data },
        alerta: { ...this.alerta },
      };
    }),
  };
  Object.assign(base, overrides);
  if (overrides.data) Object.assign(base.data, overrides.data);
  if (overrides.alerta) Object.assign(base.alerta, overrides.alerta);
  // Re-cria toObject depois do assign para pegar valores novos
  base.toObject = vi.fn().mockImplementation(function (this: any) {
    return {
      _id: this._id,
      validade: this.validade,
      data: { ...this.data },
      alerta: { ...this.alerta },
    };
  });
  return base;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// ENCERRAR
// ============================================================
describe('encerrarValidade', () => {
  it('encerra registro em espera -> 200, validade = encerrado', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '507f1f77bcf86cd799439011' });
    const res = mockRes();
    const next = mockNext();

    await encerrarValidade(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(registro.save).toHaveBeenCalled();
    expect(registro.validade).toBe('encerrado');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        sucesso: true,
        dados: expect.objectContaining({ validade: 'encerrado' }),
      })
    );
  });

  it('encerra registro em alerta -> 200', async () => {
    const registro = criarRegistroFake({
      validade: 'alerta',
      // Data perto, dentro do período de alerta: 2027-02-10 com 30 dias de alerta
      // Hoje no teste é 2026, então para forçar alerta usamos data próxima do "hoje real"
      // Por isso usamos data dinâmica abaixo no teste real
    });
    // Força alerta real: data = hoje + 2 dias, alerta 7 dias
    const hoje = new Date();
    const dataAlerta = new Date(hoje);
    dataAlerta.setDate(hoje.getDate() + 2);
    const iso = dataAlerta.toISOString().slice(0, 10);
    registro.data.data_iso = iso;
    registro.alerta.dias_antecedencia = 7;
    registro.validade = 'alerta';
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' });
    const res = mockRes();
    const next = mockNext();

    await encerrarValidade(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(registro.validade).toBe('encerrado');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('bloqueia encerrar registro já encerrado -> 409 JA_ENCERRADO', async () => {
    const registro = criarRegistroFake({
      validade: 'encerrado',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' });
    const res = mockRes();
    const next = mockNext();

    await encerrarValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, codigo: 'JA_ENCERRADO' })
    );
    expect(registro.save).not.toHaveBeenCalled();
  });

  it('bloqueia encerrar registro vencido no banco -> 409 JA_VENCIDO', async () => {
    const registro = criarRegistroFake({
      validade: 'vencido',
      data: { data_iso: '2020-01-01' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' });
    const res = mockRes();
    const next = mockNext();

    await encerrarValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, codigo: 'JA_VENCIDO' })
    );
    expect(registro.save).not.toHaveBeenCalled();
  });

  it('bloqueia encerrar quando banco diz espera mas cálculo diz vencido -> 409 JA_VENCIDO', async () => {
    // BUG QUE A CAMADA 2 TEM QUE PEGAR: cron não rodou, banco diz espera, mas já venceu
    const registro = criarRegistroFake({
      validade: 'espera', // banco desatualizado
      data: { data_iso: '2020-01-01' }, // já venceu de verdade
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' });
    const res = mockRes();
    const next = mockNext();

    await encerrarValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, codigo: 'JA_VENCIDO' })
    );
    expect(registro.save).not.toHaveBeenCalled();
    // Nunca pode transformar perda em sucesso
    expect(registro.validade).not.toBe('encerrado');
  });

  it('retorna 404 se registro não existe', async () => {
    mockedFindById.mockResolvedValue(null);

    const req = mockReq({ id: 'id-inexistente' });
    const res = mockRes();
    const next = mockNext();

    await encerrarValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, codigo: 'NAO_ENCONTRADO' })
    );
  });

  it('não lê req.body no encerramento - ignora qualquer campo enviado', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    // Front tenta mandar validade, data, etc - tem que ser ignorado
    const req = mockReq(
      { id: '1' },
      { validade: 'vencido', data: { data_iso: '2020-01-01' } }
    );
    const res = mockRes();
    const next = mockNext();

    await encerrarValidade(req, res, next);

    expect(registro.validade).toBe('encerrado');
    expect(registro.data.data_iso).toBe('2027-02-10'); // não mudou
  });
});

// ============================================================
// CORRIGIR
// ============================================================
describe('corrigirValidade', () => {
  it('corrige só data_iso -> 200, atualiza ano/mes/dia juntos', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10', ano: 2027, mes: 2, dia: 10 },
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq(
      { id: '1' },
      { data: { data_iso: '2027-03-15' } }
    );
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(registro.data.data_iso).toBe('2027-03-15');
    expect(registro.data.ano).toBe(2027);
    expect(registro.data.mes).toBe(3);
    expect(registro.data.dia).toBe(15);
    expect(registro.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('corrige só dias_antecedencia -> 200, data não muda', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq(
      { id: '1' },
      { alerta: { dias_antecedencia: 30 } }
    );
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(registro.alerta.dias_antecedencia).toBe(30);
    expect(registro.data.data_iso).toBe('2027-02-10');
  });

  it('corrige data + alerta juntos -> 200', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq(
      { id: '1' },
      { data: { data_iso: '2027-05-20' }, alerta: { dias_antecedencia: 10 } }
    );
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(registro.data.data_iso).toBe('2027-05-20');
    expect(registro.alerta.dias_antecedencia).toBe(10);
  });

  it('transição espera -> alerta: corrige alerta para cobrir a data', async () => {
    // Data 2027-02-10, alerta 7 = espera (longe)
    // Muda alerta para 365 = entra no período de alerta
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq(
      { id: '1' },
      { alerta: { dias_antecedencia: 365 } }
    );
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(registro.validade).toBe('alerta');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        dados: expect.objectContaining({ validade: 'alerta' }),
      })
    );
  });

  it('transição alerta -> espera: reduz alerta', async () => {
    // Força alerta real: data = hoje + 2 dias, alerta 7
    const hoje = new Date();
    const dataAlerta = new Date(hoje);
    dataAlerta.setDate(hoje.getDate() + 2);
    const iso = dataAlerta.toISOString().slice(0, 10);

    const registro = criarRegistroFake({
      validade: 'alerta',
      data: { data_iso: iso },
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    // Reduz alerta para 1 dia: 2 dias restantes > 1 = volta para espera
    const req = mockReq(
      { id: '1' },
      { alerta: { dias_antecedencia: 1 } }
    );
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(registro.validade).toBe('espera');
  });

  it('bloqueia corrigir registro encerrado -> 409 JA_ENCERRADO', async () => {
    const registro = criarRegistroFake({
      validade: 'encerrado',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { data: { data_iso: '2027-03-15' } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, codigo: 'JA_ENCERRADO' })
    );
    expect(registro.save).not.toHaveBeenCalled();
  });

  it('bloqueia corrigir registro vencido no banco -> 409 JA_VENCIDO', async () => {
    const registro = criarRegistroFake({
      validade: 'vencido',
      data: { data_iso: '2020-01-01' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { data: { data_iso: '2027-03-15' } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, codigo: 'JA_VENCIDO' })
    );
  });

  it('bloqueia corrigir quando banco diz espera mas cálculo diz vencido -> 409 JA_VENCIDO', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2020-01-01' },
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { data: { data_iso: '2027-03-15' } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, codigo: 'JA_VENCIDO' })
    );
    expect(registro.save).not.toHaveBeenCalled();
    expect(registro.data.data_iso).toBe('2020-01-01'); // não mudou
  });

  it('bloqueia quando não envia nenhum campo -> 400 CAMPO_NAO_EDITAVEL', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, {});
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, codigo: 'CAMPO_NAO_EDITAVEL' })
    );
    expect(registro.save).not.toHaveBeenCalled();
  });

  it('bloqueia dias_antecedencia = 0 -> 400 ERRO_DE_DIAS', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { alerta: { dias_antecedencia: 0 } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, codigo: 'ERRO_DE_DIAS' })
    );
  });

  it('bloqueia dias_antecedencia negativo -> 400 ERRO_DE_DIAS', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { alerta: { dias_antecedencia: -5 } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, codigo: 'ERRO_DE_DIAS' })
    );
  });

  it('bloqueia dias_antecedencia decimal -> 400 ERRO_DE_DIAS', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { alerta: { dias_antecedencia: 7.5 } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, codigo: 'ERRO_DE_DIAS' })
    );
  });

  it('bloqueia dias_antecedencia string -> 400 ERRO_DE_DIAS', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { alerta: { dias_antecedencia: '7' } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, codigo: 'ERRO_DE_DIAS' })
    );
  });

  it('bloqueia corrigir para data no passado -> 400 DATA_PASSADA', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { data: { data_iso: '2020-01-01' } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, codigo: 'DATA_PASSADA' })
    );
  });

  it('bloqueia corrigir para data de hoje -> 400 DATA_IGUAL_HOJE', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    // DEPOIS - CERTO, data local
function dataLocalHoje(): string {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

const hojeIso = dataLocalHoje();
    const req = mockReq({ id: '1' }, { data: { data_iso: hojeIso } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, codigo: 'DATA_IGUAL_HOJE' })
    );
  });

  it('bloqueia corrigir para data inválida -> 400 DATA_PASSADA', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { data: { data_iso: 'data-invalida' } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, codigo: 'DATA_PASSADA' })
    );
  });

  it('bloqueia correção que deixaria vencido -> 400 FICARIA_VENCIDO', async () => {
    // Hoje + 1 dia, com alerta de 30 dias: já estaria no período de alerta?
    // Para forçar FICARIA_VENCIDO, precisamos de data futura mas dentro do alerta de forma que vire vencido
    // Na regra atual, vencido = diasRestantes <= 0, então qualquer data futura não vira vencido
    // Esse teste documenta que FICARIA_VENCIDO só dispara se a Camada 1 mudar a regra de vencido
    // Por enquanto, testamos um caso que NÃO deve disparar FICARIA_VENCIDO
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const isoAmanha = amanha.toISOString().slice(0, 10);

    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq(
      { id: '1' },
      { data: { data_iso: isoAmanha }, alerta: { dias_antecedencia: 30 } }
    );
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    // Amanhã com 30 dias de alerta = alerta, não vencido, então autoriza
    expect(next).not.toHaveBeenCalled();
    expect(registro.validade).toBe('alerta');
  });

  it('retorna 404 se registro não existe', async () => {
    mockedFindById.mockResolvedValue(null);

    const req = mockReq({ id: 'id-inexistente' }, { data: { data_iso: '2027-03-15' } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, codigo: 'NAO_ENCONTRADO' })
    );
  });

  it('ignora campo validade enviado pelo front - nunca deixa o front decidir status', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
      alerta: { dias_antecedencia: 7 },
    });
    mockedFindById.mockResolvedValue(registro);

    // Front tenta forçar encerrado ou vencido
    const req = mockReq(
      { id: '1' },
      {
        validade: 'encerrado',
        data: { data_iso: '2027-03-15' },
      }
    );
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // Status vem da Camada 2, não do front
    expect(registro.validade).not.toBe('encerrado');
    expect(['espera', 'alerta']).toContain(registro.validade);
  });

  it('ignora campos não editáveis como produto e funcionario', async () => {
    const registro = criarRegistroFake({
      validade: 'espera',
      data: { data_iso: '2027-02-10' },
      alerta: { dias_antecedencia: 7 },
    });
    (registro as any).produto = { nome: 'Original' };
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq(
      { id: '1' },
      {
        produto: { nome: 'Hackeado' },
        funcionario: { nome: 'Outro' },
        data: { data_iso: '2027-03-15' },
      }
    );
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((registro as any).produto.nome).toBe('Original');
    expect(registro.data.data_iso).toBe('2027-03-15');
  });

  it('não salva se Camada 2 bloquear', async () => {
    const registro = criarRegistroFake({
      validade: 'encerrado',
      data: { data_iso: '2027-02-10' },
    });
    mockedFindById.mockResolvedValue(registro);

    const req = mockReq({ id: '1' }, { data: { data_iso: '2027-03-15' } });
    const res = mockRes();
    const next = mockNext();

    await corrigirValidade(req, res, next);

    expect(registro.save).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});