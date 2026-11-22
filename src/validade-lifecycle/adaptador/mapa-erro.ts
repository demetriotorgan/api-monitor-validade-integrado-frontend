// src/validade-lifecycle/adaptador/mapa-erro.ts
// Traduz DecisaoLifecycle negada -> ErroEdicao do controller atual
// Não muda regra, só traduz código -> status HTTP + mensagem

import { ErroEdicao } from "../../erros/app-error.js"; 

const MAPA_STATUS: Record<string, number> = {
  ERRO_DE_DIAS: 400,
  DATA_PASSADA: 400,
  DATA_IGUAL_HOJE: 400,
  FICARIA_VENCIDO: 400,
  DUPLICATA: 409,
  PRODUTO_INVALIDO: 400,
  TRANSICAO_PROIBIDA: 400,
  JA_ENCERRADO: 400,
  JA_VENCIDO: 400,
};

export function decisaoParaErro(codigo: string, motivo: string): ErroEdicao {
  const status = MAPA_STATUS[codigo] ?? 400;
  return new ErroEdicao(motivo, status);
}