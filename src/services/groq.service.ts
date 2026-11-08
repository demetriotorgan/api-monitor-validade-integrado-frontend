
import 'dotenv/config';
import Groq from 'groq-sdk';

let clienteGroq: Groq | undefined;

function obterClienteGroq(): Groq {
    if (clienteGroq) {
        return clienteGroq;
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        throw new Error(
            'A variável GROQ_API_KEY não está configurada.',
        );
    }

    clienteGroq = new Groq({
        apiKey,
    });

    return clienteGroq;
}

export async function analisarImagemValidade(imagem: Buffer, tipoImagem: string): Promise<string> {
    const groq = obterClienteGroq();

    const imagemBase64 = imagem.toString('base64');
    const imagemUrl = `data:${tipoImagem};base64,${imagemBase64}`;

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
                        text: `
Você é um sistema especializado em identificar a DATA DE VALIDADE
impressa em embalagens de produtos.

OBJETIVO PRINCIPAL:
Identificar e transcrever a data de validade, não a data de
fabricação.

REGRAS OBRIGATÓRIAS:
1. Procure primeiro por datas precedidas de V., VAL, VALIDADE,
   EXP, EXPIRY ou expressões equivalentes.
2. Datas precedidas de F., FAB, FABRICAÇÃO ou FABRICADO
   representam fabricação e NÃO são a validade.
3. Se houver uma data identificada por V., priorize essa data.
4. Transcreva todos os dígitos exatamente como aparecem.
   Examine especialmente o último dígito do ano.
5. Não deduza o ano pela data atual, pelo lote ou por outras datas.
6. Não transforme uma data de fabricação em validade.
7. Se nenhuma validade puder ser identificada com segurança,
   retorne null em data_validade.
8. Não invente nem corrija dígitos por suposição.
9. Preserve os separadores originais, como pontos e barras.

Retorne somente JSON válido neste formato:
{
  "data_validade": "21.10.26",
  "texto_identificado": "F.27.03.25 L1250 T09 V.21.10.26",
  "observacao": "Validade identificada pelo prefixo V."
}

Os valores acima são exemplos de formato, não respostas
predefinidas. Analise exclusivamente a imagem recebida.
`.trim(),
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
            'O Groq não retornou conteúdo para a imagem.',
        );
    }

    return conteudo;
}
