import { model, Schema, Types } from "mongoose";
import { IAlertaConfig, IDadosML, IDadosProduto, IDataValidade, IValidade } from "../types/validade.types.js";

const AlertaConfigSchema = new Schema<IAlertaConfig>(
  {
    dias_antecedencia: {
      type: Number,
      required: true,
      min: 1
    },
    ultimo_envio_em: {
      type: Date
    },
  },
  { _id: false }
);

const DataValidadeSchema = new Schema<IDataValidade>(
  {
    ano: { type: Number, required: true },
    mes: { type: Number, required: true, min: 1, max: 12 },
    dia: { type: Number, required: true, min: 1, max: 31 },
    data_iso: { type: String, required: true },
    data_original: { type: String, required: true },
  },
  { _id: false }
);

const DadosProdutoSchema = new Schema<IDadosProduto>(
  {
    _id_produto: {
      type: Schema.Types.Mixed,
      required: true,
      validate: {
        validator: (valor: unknown) =>
          typeof valor === 'string' || valor instanceof Types.ObjectId,
        message: '_id_produto deve ser string ou ObjectId',
      },
    },
    codigoBarras: { type: String, required: true },
    nome: { type: String, required: true },
  },
  { _id: false }
);

const DadosMLSchema = new Schema<IDadosML>({}, { _id: false });

const ValidadeSchema = new Schema<IValidade>(
  {
    data: { type: DataValidadeSchema, required: true },
    produto: { type: DadosProdutoSchema, required: true },
    ml: { type: DadosMLSchema, default: {} },
    alerta: { type: AlertaConfigSchema, required: true },
  },
  {
    timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' },
    versionKey: false,
    collection: 'validades',
  }
);

// Índices úteis para leituras futuras
ValidadeSchema.index({ 'produto._id_produto': 1 });
ValidadeSchema.index({ 'produto.codigoBarras': 1 });
ValidadeSchema.index({ 'data.data_iso': 1 });

export const ValidadeModel = model<IValidade>('Validade', ValidadeSchema);