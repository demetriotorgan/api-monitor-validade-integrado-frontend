import mongoose, { Schema, Document } from 'mongoose';
import type { IProduto, CriarProdutoDTO, AtualizarProdutoDTO } from '../types/produto.types.js';

export interface IProdutoDocument extends IProduto, Document {}

const ProdutoSchema = new Schema<IProdutoDocument>(
  {
    codigoBarras: {
      type: String,
      required: [true, 'O código de barras é obrigatório'],
      unique: true,
      trim: true,
      index: true,
    },
    nome: {
      type: String,
      required: [true, 'O nome do produto é obrigatório'],
      trim: true,
      maxlength: [255, 'O nome deve ter no máximo 255 caracteres'],
    },
  },
  {
    timestamps: {
      createdAt: 'criadoEm',
      updatedAt: 'atualizadoEm',
    },
    versionKey: false,
  }
);

// Índice composto opcional para buscas por nome
ProdutoSchema.index({ nome: 'text', codigoBarras: 'text' });

export const ProdutoModel = mongoose.model<IProdutoDocument>('Produto', ProdutoSchema);

