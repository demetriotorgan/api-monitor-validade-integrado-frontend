import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { podeCorrigir } from '../validade-lifecycle/orquestrador/camada2-correcao.js';
import { podeEncerrar } from '../validade-lifecycle/orquestrador/camada2-encerramento.js';

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

function dataFutura(dias: number): string {
    const base = new Date(`${hojeBrasiliaISO()}T12:00:00-03:00`);
    base.setDate(base.getDate() + dias);
    return base.toISOString().slice(0, 10);
}

function criarAtual(overrides: Record<string, unknown> = {}) {
    return {
        data_iso: dataFutura(30),
        dias_antecedencia: 3,
        ...overrides,
    };
}

function criarCorrecao(overrides: Record<string, unknown> = {}) {
    return {
        ...overrides,
    };
}

describe('Camada 2 - Correção: podeCorrigir', () => {
    describe('status terminais não podem ser corrigidos', () => {
        it('rejeita status encerrado com JA_ENCERRADO', () => {
            const resultado = podeCorrigir('encerrado', criarAtual(), criarCorrecao({ data_iso: dataFutura(5) })) as any;
            assert.equal(resultado.autorizado, false);
            assert.equal(resultado.codigo, 'JA_ENCERRADO');
        });

        it('rejeita status vencido com JA_VENCIDO', () => {
            const resultado = podeCorrigir('vencido', criarAtual(), criarCorrecao({ data_iso: dataFutura(5) })) as any;
            assert.equal(resultado.autorizado, false);
            assert.equal(resultado.codigo, 'JA_VENCIDO');
        });
    });

    describe('correção vazia e campos editáveis', () => {
        it('rejeita quando não veio nenhum campo para corrigir', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao()) as any;
            assert.equal(resultado.autorizado, false);
            assert.equal(resultado.codigo, 'CAMPO_NAO_EDITAVEL');
        });

        it('rejeita quando correcao é objeto vazio explicitamente', () => {
            const resultado = podeCorrigir('alerta', criarAtual(), {}) as any;
            assert.equal(resultado.autorizado, false);
            assert.equal(resultado.codigo, 'CAMPO_NAO_EDITAVEL');
        });
    });

    describe('validação de dias_antecedencia corrigido', () => {
        it('rejeita NaN', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ dias_antecedencia: NaN })) as any;
            assert.equal(resultado.autorizado, false);
        });

        it('rejeita negativo', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ dias_antecedencia: -1 })) as any;
            assert.equal(resultado.autorizado, false);
        });

        it('rejeita string', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ dias_antecedencia: '5' })) as any;
            assert.equal(resultado.autorizado, false);
        });

        it('aceita zero', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ dias_antecedencia: 0 })) as any;
            assert.equal(resultado.autorizado, true);
        });
    });

    describe('validação de data_iso corrigida', () => {
        it('rejeita data vazia com DATA_PASSADA', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ data_iso: '' })) as any;
            assert.equal(resultado.autorizado, false);
            assert.equal(resultado.codigo, 'DATA_PASSADA');
        });

        it('rejeita data no passado com DATA_PASSADA', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ data_iso: dataFutura(-1) })) as any;
            assert.equal(resultado.autorizado, false);
            assert.equal(resultado.codigo, 'DATA_PASSADA');
        });

        it('rejeita data igual a hoje com DATA_IGUAL_HOJE', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ data_iso: dataFutura(0) })) as any;
            assert.equal(resultado.autorizado, false);
            assert.equal(resultado.codigo, 'DATA_IGUAL_HOJE');
        });
    });

    describe('correções válidas', () => {
        it('só dias_antecedencia: atual +30 alerta 3 -> alerta 10 permanece espera', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ dias_antecedencia: 10 })) as any;
            assert.equal(resultado.autorizado, true);
            assert.equal(resultado.proximoStatus, 'espera');
            assert.equal(resultado.statusCalculado, 'espera');
        });

        // só dias_antecedencia: atual +5 alerta 3 -> alerta 6 muda para alerta
        // Conta: data = hoje+5, alerta novo = 6, inicio = (hoje+5) - 6 = hoje-1
        // Hoje já passou do inicio, então já está em alerta
        const atual = criarAtual({ data_iso: dataFutura(5), dias_antecedencia: 3 });
        const resultado = podeCorrigir('espera', atual, { dias_antecedencia: 6 });
        assert.equal(resultado.autorizado, true);
        if (resultado.autorizado) {
            assert.equal(resultado.proximoStatus, 'alerta');
            assert.equal(resultado.statusCalculado, 'alerta');
        }
        
        // só dias_antecedencia: atual +5 alerta 3 -> alerta 2 mantém espera
        // Conta: inicio = (hoje+5) - 2 = hoje+3, hoje ainda está antes do inicio
        const atual2 = criarAtual({ data_iso: dataFutura(5), dias_antecedencia: 3 });
        const resultado2 = podeCorrigir('espera', atual2, { dias_antecedencia: 2 });
        assert.equal(resultado2.autorizado, true);
        if (resultado2.autorizado) {
            assert.equal(resultado2.proximoStatus, 'espera');
        }

        it('só data_iso: atual +30 alerta 3 -> +2 alerta 3 fica alerta', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ data_iso: dataFutura(2) })) as any;
            assert.equal(resultado.autorizado, true);
            assert.equal(resultado.proximoStatus, 'alerta');
            assert.equal(resultado.statusCalculado, 'alerta');
        });

        it('data futura distante retorna espera', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ data_iso: dataFutura(30), dias_antecedencia: 3 })) as any;
            assert.equal(resultado.autorizado, true);
            assert.equal(resultado.proximoStatus, 'espera');
            assert.equal(resultado.statusCalculado, 'espera');
        });

        it('data futura próxima dentro do alerta retorna alerta', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ data_iso: dataFutura(2), dias_antecedencia: 3 })) as any;
            assert.equal(resultado.autorizado, true);
            assert.equal(resultado.proximoStatus, 'alerta');
            assert.equal(resultado.statusCalculado, 'alerta');
        });

        it('alerta 0 com data futura próxima mantém espera', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ data_iso: dataFutura(1), dias_antecedencia: 0 })) as any;
            assert.equal(resultado.autorizado, true);
            assert.equal(resultado.proximoStatus, 'espera');
            assert.equal(resultado.statusCalculado, 'espera');
        });
    });

    describe('correção não pode deixar vencido', () => {
        it('data futura nunca deixa vencido', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ data_iso: dataFutura(1), dias_antecedencia: 0 })) as any;
            assert.equal(resultado.autorizado, true);
            assert.notEqual(resultado.statusCalculado, 'vencido');
        });

        it('tentativa de hoje já é barrada antes de FICARIA_VENCIDO', () => {
            const resultado = podeCorrigir('espera', criarAtual(), criarCorrecao({ data_iso: dataFutura(0), dias_antecedencia: 0 })) as any;
            assert.equal(resultado.autorizado, false);
            assert.equal(resultado.codigo, 'DATA_IGUAL_HOJE');
        });
    });

    describe('formato e pureza da decisão negada', () => {
        it('sempre retorna motivo string não vazia e código válido nas rejeições', () => {
            const cenarios = [
                { statusSalvo: 'encerrado' as const, atual: criarAtual(), correcao: criarCorrecao({ data_iso: dataFutura(5) }) },
                { statusSalvo: 'vencido' as const, atual: criarAtual(), correcao: criarCorrecao({ data_iso: dataFutura(5) }) },
                { statusSalvo: 'espera' as const, atual: criarAtual(), correcao: criarCorrecao() },
                { statusSalvo: 'espera' as const, atual: criarAtual(), correcao: criarCorrecao({ dias_antecedencia: -1 }) },
                { statusSalvo: 'espera' as const, atual: criarAtual(), correcao: criarCorrecao({ data_iso: '' }) },
                { statusSalvo: 'espera' as const, atual: criarAtual(), correcao: criarCorrecao({ data_iso: dataFutura(-1) }) },
                { statusSalvo: 'espera' as const, atual: criarAtual(), correcao: criarCorrecao({ data_iso: dataFutura(0) }) },
            ];

            for (const cenario of cenarios) {
                const resultado = podeCorrigir(cenario.statusSalvo, cenario.atual, cenario.correcao) as any;
                assert.equal(resultado.autorizado, false);
                assert.ok(typeof resultado.motivo === 'string' && resultado.motivo.length > 0, `motivo ausente para ${JSON.stringify(cenario)}`);
                assert.ok(CODIGOS_VALIDOS.includes(resultado.codigo), `código inválido: ${resultado.codigo}`);
            }
        });

        it('é pura: duas chamadas idênticas retornam mesmo resultado', () => {
            const atual = criarAtual();
            const correcao = criarCorrecao({ dias_antecedencia: 5 });
            const r1 = podeCorrigir('alerta', atual, correcao);
            const r2 = podeCorrigir('alerta', atual, correcao);
            assert.deepStrictEqual(r1, r2);
        });
    });
});

describe('Camada 2 - Encerramento: podeEncerrar', () => {
    it('espera pode encerrar', () => {
        const resultado = podeEncerrar('espera') as any;
        assert.equal(resultado.autorizado, true);
        assert.equal(resultado.proximoStatus, 'encerrado');
    });

    it('alerta pode encerrar', () => {
        const resultado = podeEncerrar('alerta') as any;
        assert.equal(resultado.autorizado, true);
        assert.equal(resultado.proximoStatus, 'encerrado');
    });

    it('vencido pode encerrar', () => {
        const resultado = podeEncerrar('vencido') as any;
        assert.equal(resultado.autorizado, true);
        assert.equal(resultado.proximoStatus, 'encerrado');
    });

    it('encerrado não pode encerrar de novo', () => {
        const resultado = podeEncerrar('encerrado') as any;
        assert.equal(resultado.autorizado, false);
        assert.equal(resultado.codigo, 'JA_ENCERRADO');
        assert.ok(typeof resultado.motivo === 'string' && resultado.motivo.length > 0);
    });

    it('é pura: duas chamadas idênticas retornam mesmo resultado', () => {
        const r1 = podeEncerrar('alerta');
        const r2 = podeEncerrar('alerta');
        assert.deepStrictEqual(r1, r2);
    });
});

/*
Comando para rodar:
- Node nativo com strip types: node --experimental-strip-types --test test/camada2.test.ts
- Se o projeto usa tsx: npx tsx --test src/test/camada2.test.ts
- Descoberta automática: node --test (pode exigir a flag de strip/types conforme setup)
*/
