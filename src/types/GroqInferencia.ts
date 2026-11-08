export interface MetricasInferencia{
    modelo: string,
    tokensEntrada: number | null;
    tokensSaida: number | null;
    tokensTotal: number | null;
    tempoGroqMs: number | null;
    latenciaMs: number;
}

export interface ResultadoInferenciaGroq{
    conteudo: string;
    metricas: MetricasInferencia;
}