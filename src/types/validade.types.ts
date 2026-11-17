import { Types } from 'mongoose';

/**
 * Grupo 1 — Dados da data componentizada disponibilizados pelo frontend.
 */
export interface IDataValidade {
  ano: number;
  mes: number;
  dia: number;
  data_iso: string;      // YYYY-MM-DD
  data_original: string; // ex: "22 NOV 26"
}

/**
 * Grupo 2 — Dados do produto vinculados ao registro de validade.
 */
export interface IDadosProduto {
  _id_produto: Types.ObjectId | string;
  codigoBarras: string;
  nome: string;
}

/**
 * Grupo 3 — Dados futuros para treinamento de ML com scikit-learn.
 * Estrutura flexível para evoluir sem quebrar o schema.
 */
export interface IDadosML {
  [key: string]: unknown;
}

/**
 * Grupo 4 — Interface de configuração de alerta
 */

export interface IAlertaConfig {
  dias_antecedencia: number;
  ultimo_envio_em?: Date | string;
}


/**
 * Contrato principal de persistência do registro de validade.
 */
export interface IValidade {
  _id?: Types.ObjectId;
  data: IDataValidade;
  produto: IDadosProduto;
  ml: IDadosML;
  alerta: IAlertaConfig;
  validade: StatusValidade;
  criadoEm?: Date | string;
  atualizadoEm?: Date | string;

}

export interface IValidadeCreationPayload
  extends Omit<IValidade, '_id' | 'criadoEm' | 'atualizadoEm'> { }

export interface IValidadeUpdatePayload
  extends Partial<Omit<IValidade, '_id' | 'criadoEm' | 'atualizadoEm'>> { }

export type StatusValidade = 'espera' | 'alerta' | 'vencido' | 'encerrado';

export interface AlterarValidadeBody {
  data?: IDataValidade;
  produto?: IDadosProduto;
  ml?: IDadosML;
  alerta?: Partial<IAlertaConfig>;
  validade?: 'encerrado';
}

export interface IValidadeComStatus extends IValidade {
  status: StatusValidade;
  dentro_do_periodo_alerta: boolean;
}

