// src/validade-lifecycle/orquestrador/camada1-criacao.ts
// CAMADA 1 - CRIAÇÃO
// Só decide se pode nascer. Não salva, não busca no banco direto.
// Se for aprovado, nasce com o status CALCULADO: espera ou alerta.
// Nunca nasce vencido, nunca nasce encerrado.
// Regra congelada: Front nunca manda validade.

import { calcularStatusValidade } from '../calculo/calculo.js'; 
import { isDataVencida, calcularDiasRestantes }  from '../tempo/tempo.js'
import type { DecisaoLifecycle, EntradaCriacao} from '../../types/lifecycle.type.js'

/**
 * Decide se um novo registro pode ser criado.
 * 
 * O que ela valida, na ordem:
 * 1. Produto tem que existir e não pode ser vazio
 * 2. Data tem que ser futura (não pode ser hoje, não pode ser passada)
 * 3. Data não pode deixar o registro já nascendo vencido
 * 4. dias_antecedencia tem que ser >= 0
 * 
 * O que ela NÃO faz:
 * - Não verifica duplicata aqui. Duplicata precisa do banco,
 *   e essa camada é pura. O controller vai passar o resultado
 *   da verificação de duplicata como parâmetro.
 * - Não salva. Só decide.
 * 
 * @param entrada - O que veio do front, sem validade
 * @param jaExisteDuplicata - O controller já buscou no banco e diz se existe
 */
export function podeCriar(
  entrada: EntradaCriacao,
  jaExisteDuplicata: boolean
): DecisaoLifecycle {
  // 1. Produto é obrigatório
  const produtoLimpo = entrada.produto?.trim();
  if (!produtoLimpo) {
    return {
      autorizado: false,
      motivo: 'Produto é obrigatório para cadastrar validade.',
      codigo: 'PRODUTO_INVALIDO',
    };
  }

  // 2. dias_antecedencia tem que ser inteiro > 0 - RF-15
  if (
    typeof entrada.dias_antecedencia !== 'number' ||
    !Number.isInteger(entrada.dias_antecedencia) ||
    entrada.dias_antecedencia <= 0
  ) {
    return {
      autorizado: false,
      motivo: 'O período de alerta deve ser um número inteiro maior que zero. Ex: 1, 3, 7.',
      codigo: 'ERRO_DE_DIAS',
    };
  }

  // 3. Data tem que existir
  if (!entrada.data_iso) {
    return {
      autorizado: false,
      motivo: 'Data de validade é obrigatória.',
      codigo: 'DATA_PASSADA',
    };
  }

  // 4. Data tem que ser válida e futura
  const diasRestantes = calcularDiasRestantes(entrada.data_iso);

  if (Number.isNaN(diasRestantes)) {
    return {
      autorizado: false,
      motivo: `Data ${entrada.data_iso} é inválida. Use o formato AAAA-MM-DD.`,
      codigo: 'DATA_PASSADA',
    };
  }

  if (diasRestantes === 0) {
    return {
      autorizado: false,
      motivo: 'Não é possível cadastrar com data de hoje. A data de hoje já conta como vencida.',
      codigo: 'DATA_IGUAL_HOJE',
    };
  }

  if (diasRestantes < 0) {
    return {
      autorizado: false,
      motivo: `Não é possível cadastrar com data ${entrada.data_iso}. Data no passado.`,
      codigo: 'DATA_PASSADA',
    };
  }

  // 5. Duplicata - controller já buscou no banco
  if (jaExisteDuplicata) {
    return {
      autorizado: false,
      motivo: `Já existe um registro ativo para este produto com esta data (${entrada.data_iso}).`,
      codigo: 'DUPLICATA',
    };
  }

  // 6. Calcula status real e nasce com ele
  const statusCalculado = calcularStatusValidade(
    entrada.data_iso,
    entrada.dias_antecedencia
  );

  // Só espera e alerta podem nascer
  if (statusCalculado === 'vencido') {
    return {
      autorizado: false,
      motivo: `Não é possível cadastrar com data ${entrada.data_iso}. Status calculado seria vencido com alerta de ${entrada.dias_antecedencia} dias. Aumente a data ou reduza os dias de alerta.`,
      codigo: 'JA_VENCIDO',
    };
  }

  return {
    autorizado: true,
    proximoStatus: statusCalculado, // espera ou alerta
    statusCalculado,
  };
}