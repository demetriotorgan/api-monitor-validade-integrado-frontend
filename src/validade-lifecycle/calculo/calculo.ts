// src/validade-lifecycle/calculo/calculo.ts
// CÁLCULO PURO - Sem banco, sem controller, sem side-effect.
// Depende SÓ da Camada 4 para saber o que é "hoje".
// Se o resultado estiver errado aqui, vai estar errado em todo lugar.
// Por isso a gente testa ele isolado.

import { subDays, format } from 'date-fns';
import { normalizarDataValidade, calcularDiasRestantes} from '../tempo/tempo.js'
import { StatusValidade } from '../../types/validade.types.js';

/**
 * Calcula o status que um registro DEVERIA ter,
 * com base na data e no alerta, usando o "hoje" da Camada 4.
 * 
 * Regras congeladas:
 * - diasRestantes <= 0 -> vencido (data == hoje já é vencido)
 * - 0 < diasRestantes <= dias_antecedencia -> alerta
 * - diasRestantes > dias_antecedencia -> espera
 * 
 * Essa função NÃO sabe o que é "encerrado".
 * Encerrado é decisão da Camada 3, não cálculo.
 * Por isso ela nunca retorna "encerrado".
 */
export function calcularStatusValidade(
  data_iso: string,
  dias_antecedencia: number
): Exclude<StatusValidade, 'encerrado'> {
  const diasRestantes = calcularDiasRestantes(data_iso);

  if (diasRestantes <= 0) {
    return 'vencido';
  }

  if (diasRestantes <= dias_antecedencia) {
    return 'alerta';
  }

  return 'espera';
}

/**
 * Calcula a partir de que dia o registro entra em alerta.
 * É só data - dias_antecedencia.
 * Usado pelo agente para mostrar no boletim:
 * "Entra em alerta dia X"
 */
export function calcularDataInicioAlerta(
  data_iso: string,
  dias_antecedencia: number
): string {
  const validade = normalizarDataValidade(data_iso);
  const inicioAlerta = subDays(validade, dias_antecedencia);
  return format(inicioAlerta, 'yyyy-MM-dd');
}

/**
 * Calcula quando o registro vai vencer, em dias, para o boletim.
 * É um atalho para não precisar chamar a Camada 4 direto no front.
 */
export function calcularDiasParaVencer(data_iso: string): number {
  return calcularDiasRestantes(data_iso);
}

/**
 * Helper para a Camada 3: dado um status salvo e o status calculado,
 * diz se precisa transicionar por tempo.
 * 
 * Regras congeladas:
 * - espera -> alerta : precisa, se o cálculo disser alerta
 * - alerta -> vencido : precisa, se o cálculo disser vencido
 * - espera -> vencido : precisa, mas em 2 passos (passa por alerta primeiro)
 * - Qualquer outro caso: não precisa (ou é proibido)
 */
export function precisaTransicionarPorTempo(
  statusSalvo: StatusValidade,
  statusCalculado: Exclude<StatusValidade, 'encerrado'>
): boolean {
  if (statusSalvo === 'encerrado' || statusSalvo === 'vencido') {
    return false; // Terminais nunca transicionam
  }

  // Se o cálculo disser o mesmo que está salvo, não precisa fazer nada.
  // Isso garante idempotência do cron.
  if (statusSalvo === statusCalculado) {
    return false;
  }

  // Só esses dois caminhos são válidos para transição por tempo
  if (statusSalvo === 'espera' && statusCalculado === 'alerta') return true;
  if (statusSalvo === 'espera' && statusCalculado === 'vencido') return true; // Vai em 2 passos na Camada 3
  if (statusSalvo === 'alerta' && statusCalculado === 'vencido') return true;

  // Qualquer outro caso (ex: alerta -> espera) é correção, não transição por tempo
  return false;
}

/**
 * Helper para a Camada 2: dado um status calculado após correção,
 * diz se ele é aceitável para correção.
 * Correção só pode resultar em espera ou alerta, nunca vencido.
 */
export function isStatusValidoParaCorrecao(
  statusCalculado: string
): boolean {
  return statusCalculado === 'espera' || statusCalculado === 'alerta';
}