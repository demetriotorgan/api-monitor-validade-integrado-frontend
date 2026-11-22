// src/validade-lifecycle/orquestrador/camada3-alertas.ts
// CAMADA 03 - ALERTAS / ENVIO / CRON
// Orquestra quem precisa ser enviado.
// Usa Camada 01 para calcular. Não decide mutação, isso é Camada 02.
// Regras congeladas:
// - alerta é calculado, nunca confiado no banco
// - só envia se status real = alerta
// - só envia se nunca enviou hoje (ultimo_envio_em < inicio do dia)
// - vencido e encerrado nunca entram

import { fromZonedTime } from 'date-fns-tz';
import { startOfDay, format } from 'date-fns';
import { ValidadeModel } from '../../models/Validade.js';
import type { IValidade } from '../../types/validade.types.js'; 
import { calcularStatusValidade } from '../calculo/calculo.js';
import { obterHojeBrasilia, TIMEZONE_BRASILIA } from '../tempo/tempo.js'

export async function buscarAlertasPendentes() {
  const hoje = obterHojeBrasilia();
  const hojeStr = format(hoje, 'yyyy-MM-dd');
  const inicioDoDia = fromZonedTime(startOfDay(hoje), TIMEZONE_BRASILIA);

  // Busca amplo: não filtra por 'alerta' no banco, porque é calculado.
  // Só exclui encerrado (único armazenado) e já vencido por data.
  const candidatos = await ValidadeModel.find({
    validade: { $ne: 'encerrado' },
    'data.data_iso': { $gte: hojeStr },
    $or: [
      { 'alerta.ultimo_envio_em': { $exists: false } },
      { 'alerta.ultimo_envio_em': null },
      { 'alerta.ultimo_envio_em': { $lt: inicioDoDia } },
    ],
  })
    .sort({ 'data.data_iso': 1 })
    .lean<IValidade[]>();

  // Camada 01 decide quem realmente é alerta agora
  const pendentes = candidatos.filter((registro) => {
    const statusReal = calcularStatusValidade(
      registro.data.data_iso,
      registro.alerta.dias_antecedencia
    );
    return statusReal === 'alerta';
  });

  return { pendentes, data_referencia: hojeStr, quantidade: pendentes.length };
}