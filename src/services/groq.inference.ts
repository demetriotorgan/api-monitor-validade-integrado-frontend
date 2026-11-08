
import { obterClienteGroq } from '../config/groq.client.js';
import { promptValidade } from '../prompts/ validade.prompt.js'

export async function executarInferenciaGroq(imagemUrl: string): Promise<string> {
 
  const groq = obterClienteGroq();

  const resposta = await groq.chat.completions.create({
    model: 'qwen/qwen3.8-27b',
    max_completion_tokens: 300,
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

  const conteudo = resposta.choices[0]?.message.content;

  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    throw new Error(
      'O Groq não retornou conteúdo para a imagem.'
    );
  }

  return conteudo;
}
