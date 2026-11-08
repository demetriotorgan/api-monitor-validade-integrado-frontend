
import { performance } from 'node:perf_hooks';

import { obterClienteGroq } from '../config/groq.client.js';
import { promptValidade } from '../prompts/ validade.prompt.js';

import type {
  ResultadoInferenciaGroq
} from '../types/GroqInferencia.js';

export async function executarInferenciaGroq(
  imagemUrl: string
): Promise<ResultadoInferenciaGroq> {

  const groq = obterClienteGroq();

  // 1. Iniciar medição da latência
  const inicio = performance.now();

  // 2. Executar inferência
  const resposta = await groq.chat.completions.create({
    model: 'qwen/qwen3.8-27b',
    max_completion_tokens: 500,
    response_format: {
      type: 'json_object',
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: promptValidade,
          },
          {
            type: 'image_url',
            image_url: {
              url: imagemUrl,
            },
          },
        ],
      },
    ],
  });

  // 3. Encerrar medição
  const latenciaMs = performance.now() - inicio;

  // 4. Extrair conteúdo
  const conteudo = resposta.choices[0]?.message.content;

  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    throw new Error(
      'O Groq não retornou conteúdo para a imagem.'
    );
  }

  // 5. Extrair métricas
  const usage = resposta.usage;

  const metricas = {
    modelo: resposta.model,
    tokensEntrada: usage?.prompt_tokens ?? null,
    tokensSaida: usage?.completion_tokens ?? null,
    tokensTotal: usage?.total_tokens ?? null,
    tempoGroqMs: usage?.total_time != null
      ? usage.total_time * 1000
      : null,
    latenciaMs: Math.round(latenciaMs),
  };

  // 6. Retornar conteúdo e métricas
  return {
    conteudo,
    metricas,
  };
}
