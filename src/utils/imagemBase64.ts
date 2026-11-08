
export function converterImagemBase64(imagem: Buffer, tipoImagem: string): string {
  const imagemBase64 = imagem.toString('base64');

  return `data:${tipoImagem};base64,${imagemBase64}`;
}
