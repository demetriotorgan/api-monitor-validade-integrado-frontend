// RF-04: Normaliza código de barras - só dígitos, sem espaços ou caracteres inválidos
export function normalizarCodigoBarras(codigo: string): string {
    return codigo.trim().replace(/[^0-9]/g, '');
}

export function escapeRegex(texto: string): string {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
