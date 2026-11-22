import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { podeCriar } from '../validade-lifecycle/orquestrador/camada1-criacao.js';  

const CODIGOS_VALIDOS = [
  'JA_VENCIDO',
  'JA_ENCERRADO',
  'DATA_PASSADA',
  'DATA_IGUAL_HOJE',
  'FICARIA_VENCIDO',
  'DUPLICATA',
  'PRODUTO_INVALIDO',
  'TRANSICAO_PROIBIDA',
  'STATUS_TERMINAL',
  'CAMPO_NAO_EDITAVEL',
];

function hojeBrasiliaISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function obterDataRelativa(dias: number): string {
  const base = new Date(`${hojeBrasiliaISO()}T12:00:00-03:00`);
  base.setDate(base.getDate() + dias);
  return base.toISOString().slice(0, 10);
}

function criarEntradaValida(overrides: Record<string, unknown> = {}) {
  return {
    produto: 'Refrigerante Cola',
    ml: 350,
    data_iso: obterDataRelativa(5),
    dias_antecedencia: 3,
    ...overrides,
  };
}

describe('Camada 1 - Criação: podeCriar', () => {
  describe('validação do produto', () => {
    it('rejeita produto vazio', () => {
      const resultado = podeCriar(criarEntradaValida({ produto: '' }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'PRODUTO_INVALIDO');
    });

    it('rejeita produto com espaços em branco', () => {
      const resultado = podeCriar(criarEntradaValida({ produto: '   ' }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'PRODUTO_INVALIDO');
    });

    it('rejeita produto null', () => {
      const resultado = podeCriar(criarEntradaValida({ produto: null }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'PRODUTO_INVALIDO');
    });

    it('rejeita produto undefined', () => {
      const resultado = podeCriar(criarEntradaValida({ produto: undefined }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'PRODUTO_INVALIDO');
    });
  });

  describe('validação de dias_antecedencia', () => {
    it('rejeita quando é NaN', () => {
      const resultado = podeCriar(criarEntradaValida({ dias_antecedencia: NaN }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
    });

    it('rejeita quando é undefined', () => {
      const resultado = podeCriar(criarEntradaValida({ dias_antecedencia: undefined }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
    });

    it('rejeita quando é string', () => {
      const resultado = podeCriar(criarEntradaValida({ dias_antecedencia: '3' }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
    });

    it('rejeita quando é negativo', () => {
      const resultado = podeCriar(criarEntradaValida({ dias_antecedencia: -1 }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
    });

    it('aceita quando é zero', () => {
      const resultado = podeCriar(criarEntradaValida({ dias_antecedencia: 0 }) as any, false) as any;
      assert.equal(resultado.autorizado, true);
    });
  });

  describe('validação da data_iso', () => {
    it('rejeita data_iso vazia', () => {
      const resultado = podeCriar(criarEntradaValida({ data_iso: '' }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'DATA_PASSADA');
    });

    it('rejeita data no passado como DATA_PASSADA', () => {
      const resultado = podeCriar(criarEntradaValida({ data_iso: obterDataRelativa(-1) }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'DATA_PASSADA');
    });

    it('rejeita data igual a hoje como DATA_IGUAL_HOJE', () => {
      const resultado = podeCriar(criarEntradaValida({ data_iso: obterDataRelativa(0) }) as any, false) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'DATA_IGUAL_HOJE');
    });
  });

  describe('regras de nascimento', () => {
    it('aprova data futura válida com proximoStatus espera', () => {
      const resultado = podeCriar(criarEntradaValida() as any, false) as any;
      assert.equal(resultado.autorizado, true);
      assert.equal(resultado.proximoStatus, 'espera');
      assert.equal(resultado.statusCalculado, 'espera');
    });

    it('sempre nasce em espera mesmo quando cálculo seria alerta', () => {
      const resultado = podeCriar(criarEntradaValida({ data_iso: obterDataRelativa(1), dias_antecedencia: 3 }) as any, false) as any;
      assert.equal(resultado.autorizado, true);
      assert.equal(resultado.proximoStatus, 'espera');
      assert.equal(resultado.statusCalculado, 'alerta');
    });

    it('data futura distante: proximoStatus espera e statusCalculado espera', () => {
      const resultado = podeCriar(criarEntradaValida({ data_iso: obterDataRelativa(30), dias_antecedencia: 3 }) as any, false) as any;
      assert.equal(resultado.autorizado, true);
      assert.equal(resultado.proximoStatus, 'espera');
      assert.equal(resultado.statusCalculado, 'espera');
    });

    it('data futura próxima: proximoStatus espera e statusCalculado alerta', () => {
      const resultado = podeCriar(criarEntradaValida({ data_iso: obterDataRelativa(2), dias_antecedencia: 3 }) as any, false) as any;
      assert.equal(resultado.autorizado, true);
      assert.equal(resultado.proximoStatus, 'espera');
      assert.equal(resultado.statusCalculado, 'alerta');
    });
  });

  describe('regra de duplicata', () => {
    it('rejeita quando jaExisteDuplicata é true', () => {
      const resultado = podeCriar(criarEntradaValida() as any, true) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'DUPLICATA');
    });
  });

  describe('campos opcionais e trim', () => {
    it('aceita produto com espaços nas pontas após trim', () => {
      const resultado = podeCriar(criarEntradaValida({ produto: '  Coca-Cola  ' }) as any, false) as any;
      assert.equal(resultado.autorizado, true);
      assert.equal(resultado.proximoStatus, 'espera');
    });

    it('não bloqueia quando ml é null', () => {
      const resultado = podeCriar(criarEntradaValida({ ml: null }) as any, false) as any;
      assert.equal(resultado.autorizado, true);
    });

    it('não bloqueia quando ml é undefined', () => {
      const resultado = podeCriar(criarEntradaValida({ ml: undefined }) as any, false) as any;
      assert.equal(resultado.autorizado, true);
    });

    it('aceita ml como número', () => {
      const resultado = podeCriar(criarEntradaValida({ ml: 1000 }) as any, false) as any;
      assert.equal(resultado.autorizado, true);
    });
  });

  describe('pureza e formato da decisão negada', () => {
    it('retorna motivo e código válidos em todas as rejeições', () => {
      const cenarios = [
        criarEntradaValida({ produto: '' }),
        criarEntradaValida({ produto: '   ' }),
        criarEntradaValida({ produto: null }),
        criarEntradaValida({ dias_antecedencia: -1 }),
        criarEntradaValida({ dias_antecedencia: NaN }),
        criarEntradaValida({ data_iso: '' }),
        criarEntradaValida({ data_iso: obterDataRelativa(-1) }),
        criarEntradaValida({ data_iso: obterDataRelativa(0) }),
      ];

      for (const entrada of cenarios) {
        const resultado = podeCriar(entrada as any, false) as any;
        assert.equal(resultado.autorizado, false);
        assert.ok(typeof resultado.motivo === 'string' && resultado.motivo.length > 0, `motivo ausente para ${JSON.stringify(entrada)}`);
        assert.ok(CODIGOS_VALIDOS.includes(resultado.codigo), `código inválido: ${resultado.codigo}`);
      }
    });

    it('é pura: duas chamadas idênticas retornam resultado igual', () => {
      const entrada = criarEntradaValida();
      const r1 = podeCriar(entrada as any, false);
      const r2 = podeCriar(entrada as any, false);
      assert.deepStrictEqual(r1, r2);
    });
  });
});

/*
Comando para rodar:
- Node nativo com strip types: node --experimental-strip-types --test test/camada1-criacao.test.ts
- Se o projeto usa tsx: npx tsx --test test/camada1-criacao.test.ts
- Descoberta automática: node --test (pode exigir a flag de strip/types conforme setup)
*/
