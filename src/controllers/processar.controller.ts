
import type { Request, Response } from 'express';
import { analisarImagemValidade } from '../services/groq.service.js';

export async function processarImagem(req: Request, res: Response,): Promise<void> {
  try {
    //1.Verificar se imagem foi recebida
    if (!req.file) {
      res.status(400).json({
        sucesso: false,
        erro: 'Envie uma imagem no campo "imagem".',
      });
      return;
    }

    //2. Extrair os dados da imagem
    const {buffer, mimetype} = req.file;

    //3. Enviar imagem para o Groq
    const resultado = await analisarImagemValidade(buffer, mimetype);
    

    //4. Converter a resposta em objeto JSON
    let dados: unknown; 

    try {
      dados =  JSON.parse(resultado.conteudo);
    } catch (error) {
      res.status(502).json({
        sucesso: false,
        erro: 'O Groq retornou um JSON inválido.',
      });
      return
    }

    //5. Retonar o resultado da inferencia
    res.status(200).json({
      sucesso: true,
      dados,
      metricas: resultado.metricas
    });

  } catch (error: unknown) {
    console.error('Erro ao processar imagem: ', error);
    res.status(500).json({
      sucesso:false,
      erro:'Falha ao processar imagem'
    })
  }
}
