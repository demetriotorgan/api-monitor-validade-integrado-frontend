import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { podeTransicionarPorTempo } from '../validade-lifecycle/orquestrador/camada3-transicao.js'; 

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

function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function dataRelativa(dias: number): string {
  const base = new Date(`${hojeISO()}T12:00:00-03:00`);
  base.setDate(base.getDate() + dias);
  return base.toISOString().slice(0, 10);
}

function criarContexto(overrides: Record<string, unknown> = {}) {
  return {
    id: 'teste-1',
    statusSalvo: 'espera' as const,
    data_iso: dataRelativa(30),
    dias_antecedencia: 3,
    hoje_iso: hojeISO(),
    ...overrides,
  };
}

describe('Camada 3 - Transição por tempo: podeTransicionarPorTempo', () => {
  describe('status terminal e regras do cron', () => {
    it('encerrado nunca move, mesmo com data vencida', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'encerrado',
        data_iso: dataRelativa(-5),
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'STATUS_TERMINAL');
    });

    it('cron nunca encerra: espera não vai para encerrado', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'espera',
        data_iso: dataRelativa(30),
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.notEqual(resultado.proximoStatus, 'encerrado');
    });

    it('cron nunca encerra: alerta não vai para encerrado', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'alerta',
        data_iso: dataRelativa(2),
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.notEqual(resultado.proximoStatus, 'encerrado');
    });

    it('cron nunca encerra: vencido não vai para encerrado', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'vencido',
        data_iso: dataRelativa(-1),
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.notEqual(resultado.proximoStatus, 'encerrado');
    });
  });

  describe('idempotência: status já igual ao calculado', () => {
    it('espera com data futura distante permanece espera', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'espera',
        data_iso: dataRelativa(30),
        dias_antecedencia: 3,
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'TRANSICAO_PROIBIDA');
    });

    it('alerta com data dentro do alerta permanece alerta', () => {
      // data hoje+2, alerta 3 => diasRestantes = 2 <= 3 => alerta
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'alerta',
        data_iso: dataRelativa(2),
        dias_antecedencia: 3,
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'TRANSICAO_PROIBIDA');
    });

    it('vencido com data no passado permanece vencido', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'vencido',
        data_iso: dataRelativa(-1),
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'TRANSICAO_PROIBIDA');
    });
  });

  describe('transições permitidas para frente', () => {
    it('espera -> alerta quando data está dentro da antecedência', () => {
      // data hoje+2, alerta 3
      // inicio do alerta = (hoje+2) - 3 = hoje-1
      // como hoje já passou do inicio do alerta, o status calculado é alerta
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'espera',
        data_iso: dataRelativa(2),
        dias_antecedencia: 3,
      })) as any;
      assert.equal(resultado.autorizado, true);
      assert.equal(resultado.proximoStatus, 'alerta');
      assert.equal(resultado.statusCalculado, 'alerta');
    });

    it('alerta -> vencido quando data é hoje', () => {
      // data == hoje já conta como vencido
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'alerta',
        data_iso: dataRelativa(0),
        dias_antecedencia: 3,
      })) as any;
      assert.equal(resultado.autorizado, true);
      assert.equal(resultado.proximoStatus, 'vencido');
      assert.equal(resultado.statusCalculado, 'vencido');
    });

    it('alerta -> vencido quando data é passado', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'alerta',
        data_iso: dataRelativa(-2),
        dias_antecedencia: 3,
      })) as any;
      assert.equal(resultado.autorizado, true);
      assert.equal(resultado.proximoStatus, 'vencido');
      assert.equal(resultado.statusCalculado, 'vencido');
    });

    it('espera -> vencido direto quando cron pulou o alerta', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'espera',
        data_iso: dataRelativa(-1),
        dias_antecedencia: 3,
      })) as any;
      assert.equal(resultado.autorizado, true);
      assert.equal(resultado.proximoStatus, 'vencido');
      assert.equal(resultado.statusCalculado, 'vencido');
    });
  });

  describe('cron nunca volta', () => {
    it('vencido -> espera é proibido, mesmo com data futura distante', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'vencido',
        data_iso: dataRelativa(30),
        dias_antecedencia: 3,
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'TRANSICAO_PROIBIDA');
    });

    it('vencido -> alerta é proibido, mesmo com data dentro do alerta', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'vencido',
        data_iso: dataRelativa(2),
        dias_antecedencia: 3,
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'TRANSICAO_PROIBIDA');
    });

    it('alerta -> espera é proibido, mesmo com data futura distante', () => {
      const resultado = podeTransicionarPorTempo(criarContexto({
        statusSalvo: 'alerta',
        data_iso: dataRelativa(30),
        dias_antecedencia: 3,
      })) as any;
      assert.equal(resultado.autorizado, false);
      assert.equal(resultado.codigo, 'TRANSICAO_PROIBIDA');
    });
  });

  describe('formato e pureza da decisão negada', () => {
    it('sempre retorna motivo string não vazia e código válido nas rejeições', () => {
      const cenarios = [
        criarContexto({ statusSalvo: 'encerrado', data_iso: dataRelativa(-5) }),
        criarContexto({ statusSalvo: 'espera', data_iso: dataRelativa(30) }),
        criarContexto({ statusSalvo: 'alerta', data_iso: dataRelativa(2) }),
        criarContexto({ statusSalvo: 'vencido', data_iso: dataRelativa(30) }),
        criarContexto({ statusSalvo: 'alerta', data_iso: dataRelativa(30) }),
      ];

      for (const contexto of cenarios) {
        const resultado = podeTransicionarPorTempo(contexto) as any;
        assert.equal(resultado.autorizado, false);
        assert.ok(typeof resultado.motivo === 'string' && resultado.motivo.length > 0, `motivo ausente para ${JSON.stringify(contexto)}`);
        assert.ok(CODIGOS_VALIDOS.includes(resultado.codigo), `código inválido: ${resultado.codigo}`);
      }
    });

    it('é pura: duas chamadas idênticas retornam mesmo resultado', () => {
      const contexto = criarContexto({
        statusSalvo: 'espera',
        data_iso: dataRelativa(2),
        dias_antecedencia: 3,
      });
      const r1 = podeTransicionarPorTempo(contexto);
      const r2 = podeTransicionarPorTempo(contexto);
      assert.deepStrictEqual(r1, r2);
    });
  });
});

/*
Comando para rodar:
- Node nativo com strip types: node --experimental-strip-types --test test/camada3-transicao.test.ts
- Se o projeto usa tsx: npx tsx --test src/test/camada3-transicao.test.ts
- Descoberta automática: node --test (pode exigir a flag de strip/types conforme setup)
*/
