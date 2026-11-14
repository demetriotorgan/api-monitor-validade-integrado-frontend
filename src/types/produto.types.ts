import type { Types } from 'mongoose';

/**
 * Contrato base do produto conforme DEC-07-01
 */
export interface IProduto {  
  codigoBarras: string;
  nome: string;
  criadoEm: Date;
  atualizadoEm: Date;
}

/**
 * Payload para criação de um novo produto
 */
export interface CriarProdutoDTO {
  codigoBarras: string;
  nome: string;
}

/**
 * Payload para atualização parcial de produto
 */
export interface AtualizarProdutoDTO {
  codigoBarras?: string;
  nome?: string;
}
