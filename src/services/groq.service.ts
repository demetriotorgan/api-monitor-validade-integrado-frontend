import { converterImagemBase64 } from "../utils/imagemBase64.js";
import { executarInferenciaGroq } from "./groq.inference.js";

import type { ResultadoInferenciaGroq } from "../types/GroqInferencia.js";

export async function analisarImagemValidade(imagem:Buffer, tipoImagem:string):Promise<ResultadoInferenciaGroq>{
    //1.Preparar imagem
    const imagemUrl = converterImagemBase64(imagem, tipoImagem);

    //2. Executar inferencia
    const resultado = await executarInferenciaGroq(imagemUrl);

    //3. Retonar o resultado
    return resultado;
}