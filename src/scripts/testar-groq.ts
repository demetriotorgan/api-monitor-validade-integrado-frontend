
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { analisarImagemValidade } from '../services/groq.service.js';

import type { ResultadoInferenciaGroq } from '../types/GroqInferencia.js';

const caminhoImagem = process.argv[2];

if (!caminhoImagem) {
  throw new Error(
    'Informe o caminho da imagem como argumento.',
  );
}

const extensao = extname(caminhoImagem).toLowerCase();

const tiposImagem: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const tipoImagem = tiposImagem[extensao];

if (!tipoImagem) {
  throw new Error('Formato de imagem não suportado.');
}

async function testarGroq(): Promise<void> {
  console.log('Lendo imagem...');

  const imagem = await readFile(caminhoImagem);

  console.log(`Tamanho: ${imagem.length} bytes`);
  console.log('Enviando imagem ao Groq...');

  const resultado = await analisarImagemValidade(imagem, tipoImagem);

  console.log('\nResposta recebida:');
  console.log(resultado);

  try {
    const dados: unknown = JSON.parse(resultado.conteudo);
    console.log('\nJSON válido:', dados);
    console.dir(dados, { depth: null });
  } catch (erro: unknown) {
    console.error('\n=== VALIDAÇÃO JSON ===');
    console.error('A resposta não é um JSON válido.');
    console.error(erro);

    process.exitCode = 1;
  }
}

testarGroq().catch((erro: unknown) => {
  console.error('Falha no teste do Groq:', erro);
  process.exitCode = 1;
});
